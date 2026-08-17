/**
 * EdgeOne Makers SDK 快速开始
 *
 * 建项目 → 部署 → 等待完成 → 打印访问地址，全程不需要本地有任何构建产物。
 * 运行方式见仓库根目录的 README。
 */
import { Client, DeploymentTimeoutError, MakersError } from "./sdk.js";

const PAGE_HTML = `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <title>Hello EdgeOne</title>
  </head>
  <body>
    <h1>Hello EdgeOne Makers</h1>
    <p>这个页面由 SDK 的 quickstart 部署。</p>
  </body>
</html>
`;

const token = process.env.MAKERS_API_TOKEN;
if (!token) {
  console.error("缺少 MAKERS_API_TOKEN。先把 .env.example 复制为 .env 并填入 token。");
  process.exit(1);
}

// region 留空时 SDK 会自动探测（先试 china 再试 global），每个 Client 实例探测一次。
// 生产环境建议显式指定，省掉这次探测请求。
const configuredRegion = process.env.MAKERS_REGION;
const region =
  configuredRegion === "china" || configuredRegion === "global"
    ? configuredRegion
    : undefined;

const client = new Client({
  token,
  // 当前合同只覆盖 cli；其他取值尚未确认，不应依赖。
  source: "cli",
  ...(region ? { region } : {}),
});

// 项目名在同一账号下唯一，带上时间戳，否则第二次运行会直接撞名称冲突。
const projectName = `hello-${Date.now()}`;

try {
  console.log(`[1/3] 创建项目 ${projectName}`);
  // create 只返回 projectId，名称、状态、域名等字段要用 projects.get 另外查。
  const { projectId } = await client.projects.create({ name: projectName });
  console.log(`      projectId = ${projectId}`);

  console.log("[2/3] 打包上传并部署");
  const deployment = await client.deployments.deploy({
    projectId,
    // 内联文件由 SDK 在内存里打成 Zip，所以本地不需要有 dist 目录。
    // 换成 { directory: "./dist" } 就是部署真实构建产物。
    artifact: { files: { "index.html": PAGE_HTML } },
    // wait: true 会轮询到终态。不传则立即返回，此时只有 deploymentId、
    // projectId 和 env 三个字段，没有状态也没有地址。
    wait: true,
    onStatusChange: ({ previousStatus, deployment: current }) => {
      console.log(`      ${previousStatus ?? "(首次查询)"} -> ${current.status}`);
    },
  });

  // wait 只在「等不下去」时抛异常。部署自身失败是正常返回的，要自己判断状态。
  if (deployment.status !== "Success") {
    const { logUrl } = await client.deployments.getLog({
      projectId,
      deploymentId: deployment.deploymentId,
    });
    console.error(`\n部署结束但未成功（${deployment.status}）。构建日志：${logUrl}`);
    process.exit(1);
  }

  console.log("[3/3] 读取访问地址");
  // 关键点：Production 的正式域名不在部署结果里，而挂在项目上。
  // 部署结果的 previewUrl 只对 Preview 部署有值。
  const project = await client.projects.get({ projectId });
  if (project.presetDomain) {
    console.log(`\n完成 → https://${project.presetDomain}`);
  } else {
    console.log("\n部署成功，但项目尚未分配默认域名，稍后再查一次 projects.get 即可。");
  }
} catch (error) {
  if (error instanceof DeploymentTimeoutError) {
    // 等待超时不会取消线上部署，它还在继续跑。
    console.error("等待超时。部署仍在进行，可用 deployments.get 继续查状态。");
  } else if (error instanceof MakersError) {
    console.error(`SDK 报错（${error.name}）：${error.message}`);
    // 网络层失败时这三个字段都是 null，只在后端真的回了东西时才打印。
    const details = Object.entries({
      code: error.code,
      requestId: error.requestId,
      httpStatus: error.httpStatus,
    }).filter(([, value]) => value !== null && value !== undefined);
    if (details.length > 0) {
      console.error(details.map(([key, value]) => `${key}=${value}`).join(" "));
    }
  } else {
    throw error;
  }
  process.exit(1);
}
