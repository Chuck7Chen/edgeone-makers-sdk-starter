/**
 * Adapter B：EdgeOne Cloud Functions 入口。
 *
 * catch-all 路由，`/api/*` 的所有请求都落到这里，再交给共享的 handleApi。
 * 整个适配层就下面这几行 —— 业务逻辑一行都不在这里。
 *
 * 为什么是 Cloud Functions 而不是 Edge Functions：
 * Edge Functions 跑在 V8 边缘运行时，只有 Web API，禁止 Node 内置模块和 npm 包。
 * 而 Makers SDK 依赖 cos-nodejs-sdk-v5、node:fs/promises、node:net，
 * 必须要完整的 Node.js 运行时，也就是 Cloud Functions。
 */
import { handleApi } from "../_lib/handlers.js";

interface EventContext {
  request: Request;
  env: Record<string, string | undefined>;
}

export function onRequest(context: EventContext): Promise<Response> {
  // token 从 Makers 环境变量读，永远不下发给浏览器。
  return handleApi(context.request, {
    MAKERS_API_TOKEN: context.env["MAKERS_API_TOKEN"],
    MAKERS_REGION: context.env["MAKERS_REGION"],
  });
}
