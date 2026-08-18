/**
 * 调用观察层：把「SDK 做了什么」变成前端能渲染的结构化事件。
 *
 * 三个数据来源：
 *   1. record()   包住每次 SDK 方法调用，拿到方法名、入参、返回值、耗时
 *   2. logger     注入 Client，拿到 SDK 主动上报的内部事件
 *   3. client.region  读公开 getter，反推自动探测的结果
 *
 * 关于第 2 条要知道它的边界：v0.1.0 的 SDK 只在两个地方调 logger，都是
 * error 级 —— 回调函数抛异常、制品上传失败。**区域探测和重试退避不产生
 * 任何日志**，所以「为什么第一次调用特别慢」这件事光靠 logger 是看不出来的，
 * 只能用第 3 条从 client.region 反推。
 *
 * 注意：trace 是这个 demo 自己加的观察层，不是 SDK 的一部分。真实业务代码里
 * 直接调 SDK 方法即可。
 */
import type { Client, Logger } from "./sdk.js";

import { serializeError } from "./errors.js";

export type TraceItem =
  | {
      kind: "call";
      method: string;
      request: unknown;
      response?: unknown;
      error?: ReturnType<typeof serializeError>;
      durationMs: number;
    }
  | { kind: "log"; level: "debug" | "info" | "warn" | "error"; message: string; context?: unknown }
  | { kind: "note"; text: string };

export class Trace {
  readonly items: TraceItem[] = [];

  /** createClient 会把创建出来的 Client 登记在这里，用于事后读取探测到的 region。 */
  client: Client | undefined;

  /** 注入 Client 的 logger，把 SDK 内部日志汇进同一条时间线。 */
  readonly logger: Logger = {
    debug: (message, context) => this.#log("debug", message, context),
    info: (message, context) => this.#log("info", message, context),
    warn: (message, context) => this.#log("warn", message, context),
    error: (message, context) => this.#log("error", message, context),
  };

  #log(
    level: "debug" | "info" | "warn" | "error",
    message: string,
    context?: Readonly<Record<string, unknown>>,
  ): void {
    this.items.push({ kind: "log", level, message, ...(context ? { context } : {}) });
  }

  /** 给上一条调用挂一句教学注解，前端渲染成黄色批注。 */
  note(text: string): void {
    this.items.push({ kind: "note", text });
  }

  /**
   * 请求收尾时读一次 client.region。
   *
   * 没显式配 region 时，SDK 会在第一次业务调用前先探测（最坏 china 失败 →
   * global 成功 → 真正的请求，三个 HTTP 往返）。这个过程不打日志，只能从
   * getter 反推结果。Serverless 每次冷启动都是新实例，缓存不跨实例，
   * 所以生产环境应该显式传 region 把这一步省掉。
   */
  observeRegion(configured: boolean): void {
    if (configured || !this.client) return;
    const detected = this.client.region;
    if (!detected) return;
    this.#log("info", `region 未显式配置，SDK 自动探测到 ${detected}`, {
      建议: "生产环境显式传 region，省掉冷启动时的探测往返",
    });
  }

  async record<T>(method: string, request: unknown, run: () => Promise<T>): Promise<T> {
    const startedAt = Date.now();
    try {
      const response = await run();
      this.items.push({
        kind: "call",
        method,
        request,
        response,
        durationMs: Date.now() - startedAt,
      });
      return response;
    } catch (error) {
      this.items.push({
        kind: "call",
        method,
        request,
        error: serializeError(error),
        durationMs: Date.now() - startedAt,
      });
      throw error;
    }
  }
}
