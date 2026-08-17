// server-demo 直接用正式包名 import，和包发布后的写法完全一致。
//
// 发布前靠仓库根 package.json 里的 file: 依赖把本地构建产物链进 node_modules：
//   "@edgeone/makers-sdk": "file:../edgeone-makers-sdk-dev/packages/typescript"
// 所以跑之前要先执行 `npm run setup:sdk` 把 SDK 构建出来。
//
// 包正式发布后，把 package.json 里的 file: 换成 ^0.1.0 即可，本文件不用动。
export * from "@edgeone/makers-sdk";
