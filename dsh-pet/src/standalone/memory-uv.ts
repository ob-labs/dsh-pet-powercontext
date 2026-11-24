/** 从清华镜像获取固定版本的 uv wheel，并提取独立可执行文件。 */
import { chmodSync, mkdtempSync, renameSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { extractZip } from '../shared/zip-extract.ts';
// 摘要固定来自 https://pypi.org/pypi/uv/0.9.26/json，不能在下载时信任镜像返回的摘要。
const WHEELS: Record<string, readonly [string, string]> = {
  'linux-x64': [
    'packages/38/16/a07593a040fe6403c36f3b0a99b309f295cbfe19a1074dbadb671d5d4ef7/uv-0.9.26-py3-none-manylinux_2_17_x86_64.manylinux2014_x86_64.whl',
    'b7e89798bd3df7dcc4b2b4ac4e2fc11d6b3ff4fe7d764aa3012d664c635e2922',
  ],
  'linux-arm64': [
    'packages/ba/3d/b8186a7dec1346ca4630c674b760517d28bffa813a01965f4b57596bacf3/uv-0.9.26-py3-none-manylinux_2_17_aarch64.manylinux2014_aarch64.musllinux_1_1_aarch64.whl',
    'ea296b700d7c4c27acdfd23ffaef2b0ecdd0aa1b58d942c62ee87df3b30f06ac',
  ],
  'darwin-x64': [
    'packages/a5/8b/68ac5825a615a8697e324f52ac0b92feb47a0ec36a63759c5f2931f0c3a0/uv-0.9.26-py3-none-macosx_10_12_x86_64.whl',
    'b815e3b26eeed00e00f831343daba7a9d99c1506883c189453bb4d215f54faac',
  ],
  'darwin-arm64': [
    'packages/0d/a2/664a338aefe009f6e38e47455ee2f64a21da7ad431dbcaf8b45d8b1a2b7a/uv-0.9.26-py3-none-macosx_11_0_arm64.whl',
    '1b012e6c4dfe767f818cbb6f47d02c207c9b0c82fee69a5de6d26ffb26a3ef3c',
  ],
  'win32-x64': [
    'packages/07/5d/eb80c6eff2a9f7d5cf35ec84fda323b74aa0054145db28baf72d35a7a301/uv-0.9.26-py3-none-win_amd64.whl',
    '0315fc321f5644b12118f9928086513363ed9b29d74d99f1539fda1b6b5478ab',
  ],
  'win32-arm64': [
    'packages/ed/9d/3b2631931649b1783f5024796ca8ad2b42a01a829b9ce1202d973cc7bce5/uv-0.9.26-py3-none-win_arm64.whl',
    '344ff38749b6cd7b7dfdfb382536f168cafe917ae3a5aa78b7a63746ba2a905b',
  ],
};
/** 返回受支持平台的固定下载地址与摘要；不请求在线索引或解析最新版本。 */
export function uvWheelArtifact(platform: string) {
  const artifact = WHEELS[platform];
  if (!artifact) throw new Error('unsupported_platform');
  const [path, digest] = artifact;
  return { url: `https://mirrors.tuna.tsinghua.edu.cn/pypi/web/${path}`, name: path.split('/').pop()!, digest };
}
/** 解包已通过摘要校验的 wheel；完整提取后才替换目标文件，失败时清理临时目录。 */
export async function extractUvWheel(archive: string, bin: string, executable: string): Promise<void> {
  const directory = mkdtempSync(join(resolve(bin), '.wheel-'));
  try {
    await extractZip(archive, directory);
    const source = join(directory, 'uv-0.9.26.data', 'scripts', executable);
    chmodSync(source, 0o700);
    renameSync(source, join(bin, executable));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}
