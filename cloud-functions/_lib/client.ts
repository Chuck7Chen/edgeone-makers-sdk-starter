/**
 * Client 工厂。
 *
 * 两个 Serverless 相关的决定写在这里：
 *   - 显式传 region：每次冷启动都是新实例，自动探测的缓存不跨实例共享。
 *     留空的话最坏每次冷启动都要多发两个探测请求。
 *   - 注入 logger：把 SDK 内部行为汇进时间线（见 trace.ts）。
 */
import { Client, type ClientOptions, type Region } from "./sdk.js";

import type { Trace } from "./trace.js";

export interface Env {
  MAKERS_API_TOKEN?: string | undefined;
  MAKERS_REGION?: string | undefined;
}

/** 演示项目统一前缀，前端的清理列表靠它筛选。 */
export const DEMO_PREFIX = "sdk-demo-";

export class MissingTokenError extends Error {
  constructor() {
    super("后端没有读到 MAKERS_API_TOKEN。把 .env.example 复制成 .env 填入 token 后重启服务。");
    this.name = "MissingTokenError";
  }
}

export function resolveRegion(env: Env): Region | undefined {
  return env.MAKERS_REGION === "china" || env.MAKERS_REGION === "global"
    ? env.MAKERS_REGION
    : undefined;
}

export function createClient(
  env: Env,
  trace: Trace,
  overrides: Partial<ClientOptions> = {},
): Client {
  if (!env.MAKERS_API_TOKEN) throw new MissingTokenError();
  const region = resolveRegion(env);
  const client = new Client({
    token: env.MAKERS_API_TOKEN,
    // 当前合同只覆盖 cli；其他取值尚未确认，不应依赖。
    source: "cli",
    ...(region ? { region } : {}),
    logger: trace.logger,
    ...overrides,
  });
  trace.client = client;
  return client;
}
