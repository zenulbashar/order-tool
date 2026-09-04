import { describe, expect, it } from "vitest";

import {
  handleJsonRpc,
  isJsonRpcRequest,
  JSONRPC_INVALID_PARAMS,
  JSONRPC_METHOD_NOT_FOUND,
  MCP_PROTOCOL_VERSION,
  type ToolRegistry,
} from "./jsonrpc";

const tools: ToolRegistry = {
  list: () => [{ name: "echo", description: "echo", inputSchema: { type: "object" } }],
  async call(name, args) {
    if (name === "echo") return { content: [{ type: "text", text: String(args.text ?? "") }] };
    if (name === "boom") throw new Error("kaboom");
    return null;
  },
};
const info = { name: "test", version: "0" };

describe("MCP JSON-RPC core", () => {
  it("answers initialize with the protocol version and tool capability", async () => {
    const res = await handleJsonRpc({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }, tools, info);
    expect(res).toMatchObject({
      id: 1,
      result: { protocolVersion: MCP_PROTOCOL_VERSION, capabilities: { tools: {} }, serverInfo: info },
    });
  });

  it("lists tools and calls one with its arguments", async () => {
    const list = await handleJsonRpc({ jsonrpc: "2.0", id: 2, method: "tools/list" }, tools, info);
    expect(list).toMatchObject({ result: { tools: [{ name: "echo" }] } });
    const call = await handleJsonRpc(
      { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "echo", arguments: { text: "hi" } } },
      tools,
      info,
    );
    expect(call).toMatchObject({ result: { content: [{ type: "text", text: "hi" }] } });
  });

  it("reports a tool failure as an isError result the model can read, not a protocol error", async () => {
    const res = await handleJsonRpc(
      { jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "boom" } },
      tools,
      info,
    );
    expect(res).toMatchObject({ result: { isError: true, content: [{ text: "kaboom" }] } });
  });

  it("returns JSON-RPC errors for unknown tools, methods and missing names", async () => {
    expect(
      await handleJsonRpc({ jsonrpc: "2.0", id: 5, method: "tools/call", params: { name: "nope" } }, tools, info),
    ).toMatchObject({ error: { code: JSONRPC_INVALID_PARAMS } });
    expect(await handleJsonRpc({ jsonrpc: "2.0", id: 6, method: "resources/list" }, tools, info)).toMatchObject({
      error: { code: JSONRPC_METHOD_NOT_FOUND },
    });
    expect(
      await handleJsonRpc({ jsonrpc: "2.0", id: 7, method: "tools/call", params: {} }, tools, info),
    ).toMatchObject({ error: { code: JSONRPC_INVALID_PARAMS } });
  });

  it("stays silent for notifications and validates the envelope", async () => {
    expect(
      await handleJsonRpc({ jsonrpc: "2.0", method: "notifications/initialized" }, tools, info),
    ).toBeNull();
    expect(isJsonRpcRequest({ jsonrpc: "2.0", method: "ping" })).toBe(true);
    expect(isJsonRpcRequest({ jsonrpc: "1.0", method: "ping" })).toBe(false);
    expect(isJsonRpcRequest("ping")).toBe(false);
  });
});
