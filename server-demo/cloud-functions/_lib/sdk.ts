// server-demo 单独走这个转发文件，是为了让 cloud-functions/ 目录整体可以脱离
// 仓库根独立打包上传 —— 它自己的 package.json 里也声明了同一个依赖。
export * from "@edgeone/makers-sdk";
