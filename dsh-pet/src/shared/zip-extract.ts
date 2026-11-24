/** ZIP 解压：Windows 优先用系统 tar，其余平台用原生解包器。 */
import { spawn } from 'node:child_process';

/** 实际完成解压的实现。 */
export type ZipExtractor = 'tar' | 'native';

/** 探测系统 tar 是否可用。 */
export interface TarProbe {
  /** tar 能否执行并正常报告版本。 */
  usable: boolean;
  /** 探测时使用的命令名。 */
  command: string;
}

/**
 * 探测系统 tar 是否可用。
 *
 * @returns tar 可用时 `usable` 为真；命令缺失或执行失败时为假。
 */
export function probeTar(command = 'tar'): Promise<TarProbe> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (usable: boolean): void => {
      if (settled) return;
      settled = true;
      resolve({ usable, command });
    };
    try {
      const child = spawn(command, ['--version'], { stdio: 'ignore', windowsHide: true });
      child.once('error', () => finish(false));
      child.once('close', (code) => finish(code === 0));
    } catch {
      finish(false);
    }
  });
}

/**
 * 用系统 tar 解压 ZIP。
 *
 * 只有 Windows 的 tar（bsdtar）能读 ZIP；GNU tar 不支持该格式，因此其他平台必须走原生解包器。
 *
 * @throws tar 缺失或解压失败时抛出。
 */
export function extractZipWithTar(
  archive: string,
  targetDir: string,
  options: { signal?: AbortSignal; command?: string } = {},
): Promise<void> {
  const signal = options.signal;
  signal?.throwIfAborted();
  const command = options.command ?? 'tar';
  return new Promise((resolve, reject) => {
    const child = spawn(command, ['-xf', archive, '-C', targetDir], {
      stdio: 'ignore',
      windowsHide: true,
    });
    let failure = '';
    child.once('error', (error: NodeJS.ErrnoException) => {
      failure = error.code === 'ENOENT' ? 'tar_missing' : 'tar_failed';
    });
    child.once('close', (code) => {
      if (signal?.aborted) {
        reject(signal.reason);
        return;
      }
      if (code === 0 && !failure) {
        resolve();
        return;
      }
      // 命令存在但解压失败时 error 事件不会触发，这里补上默认原因。
      reject(new Error(failure || 'tar_failed'));
    });
  });
}

/**
 * 用原生 N-API 解包器解压 ZIP。
 *
 * 原生模块在 Windows 上用 MSVC 编译，加载它需要 Visual C++ 2015-2022 x64 运行库；该运行库不随 Windows 分发，
 * 干净系统上 import 会失败。动态 import 是必须的：静态 import 会在模块求值期抛错，让不使用该路径的用户也进不来。
 *
 * @throws 原生模块加载或解压失败时抛出。
 */
export async function extractZipWithNative(archive: string, targetDir: string): Promise<void> {
  const { default: extract } = await import('@electron-internal/extract-zip');
  await extract(archive, { dir: targetDir });
}

/**
 * 解压 ZIP：Windows 优先用系统 tar，不可用时回退原生解包器；其他平台直接用原生解包器。
 *
 * 原生解包器在 Windows 上依赖 Visual C++ 运行库，而该运行库不随 Windows 分发，干净系统上加载会失败并让
 * 安装流程停在下载之前。Windows 自带的 tar 能读同样的 ZIP，因此优先使用它可以让更多机器无需安装系统组件。
 *
 * @returns 实际完成解压的实现。
 * @throws 两种实现都失败时抛出最后一次的错误。
 */
export async function extractZip(
  archive: string,
  targetDir: string,
  options: { signal?: AbortSignal } = {},
): Promise<ZipExtractor> {
  if (process.platform === 'win32') {
    const probe = await probeTar();
    if (probe.usable) {
      try {
        await extractZipWithTar(archive, targetDir, options);
        return 'tar';
      } catch {
        // 系统 tar 缺失或损坏时不能让原生路径被跳过。
        options.signal?.throwIfAborted();
      }
    }
  }
  await extractZipWithNative(archive, targetDir);
  return 'native';
}
