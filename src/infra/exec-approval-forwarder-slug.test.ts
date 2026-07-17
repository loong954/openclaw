// Tests that sliceUtf16Safe is exercised for approval slugs with emoji IDs.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReplyPayload } from "../auto-reply/types.js";
import type { OpenClawConfig } from "../config/config.js";
import { setActivePluginRegistry } from "../plugins/runtime.js";
import { createChannelTestPluginBase, createTestRegistry } from "../test-utils/channel-plugins.js";
import { createExecApprovalForwarder } from "./exec-approval-forwarder.js";

const { mockLogError } = vi.hoisted(() => ({ mockLogError: vi.fn() }));
vi.mock("../logging/subsystem.js", () => ({
  createSubsystemLogger: () => ({
    subsystem: "gateway/exec-approvals",
    isEnabled: () => false,
    trace: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: mockLogError,
    fatal: vi.fn(),
    raw: vi.fn(),
    child: vi.fn(),
  }),
}));

const baseRequest = {
  id: "req-1",
  request: {
    command: "echo hello",
    agentId: "main",
    sessionKey: "agent:main:main",
  },
  createdAtMs: 1000,
  expiresAtMs: 6000,
};

const activeForwarders: Array<ReturnType<typeof createExecApprovalForwarder>> = [];

afterEach(() => {
  for (const fwd of activeForwarders.splice(0)) {
    fwd.stop();
  }
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const emptyRegistry = createTestRegistry([]);
const defaultRegistry = createTestRegistry([
  { pluginId: "telegram", plugin: createChannelTestPluginBase({ id: "telegram" }), source: "test" },
]);

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object") {
    throw new Error("expected " + label + " to be an object");
  }
  return value as Record<string, unknown>;
}

function requireFirstCallArg(
  mock: ReturnType<typeof vi.fn>,
  label: string,
): Record<string, unknown> {
  const firstCall = mock.mock.calls[0];
  if (!firstCall) {
    throw new Error("expected " + label + " call");
  }
  return requireRecord(firstCall[0], label);
}

function requireFirstPayload(deliver: ReturnType<typeof vi.fn>): ReplyPayload {
  const delivery = requireFirstCallArg(deliver, "delivery params") as { payloads?: ReplyPayload[] };
  const payload = delivery.payloads?.[0];
  if (!payload) {
    throw new Error("expected first delivery payload");
  }
  return payload;
}

function makeTargetsCfg(targets: Array<{ channel: string; to: string }>): OpenClawConfig {
  return { approvals: { exec: { enabled: true, mode: "targets", targets } } } as OpenClawConfig;
}

const TARGETS_CFG = makeTargetsCfg([{ channel: "slack", to: "U123" }]);

function createForwarder(params: { cfg: OpenClawConfig; deliver?: ReturnType<typeof vi.fn> }) {
  const deliver = params.deliver ?? vi.fn().mockResolvedValue([]);
  const forwarder = createExecApprovalForwarder({
    getConfig: () => params.cfg,
    deliver: deliver as (...args: unknown[]) => Promise<unknown[]>,
    nowMs: () => 1000,
  });
  activeForwarders.push(forwarder);
  return { deliver, forwarder };
}

describe("exec approval slug safety", () => {
  beforeEach(() => {
    setActivePluginRegistry(defaultRegistry);
  });

  afterEach(() => {
    setActivePluginRegistry(emptyRegistry);
  });

  it("handles approval IDs with emoji without crashing", async () => {
    vi.useFakeTimers();
    const { deliver, forwarder } = createForwarder({ cfg: TARGETS_CFG });

    // Construct emoji at runtime to avoid source-file encoding issues.
    const emojiId = "1234567" + String.fromCharCode(0xd83d, 0xdc68) + "X";

    // handleRequested should succeed without throwing.
    await expect(forwarder.handleRequested({ ...baseRequest, id: emojiId })).resolves.toBe(true);
    expect(deliver).toHaveBeenCalledTimes(1);

    // The payload should have a non-empty approvalSlug.
    const payload = requireFirstPayload(deliver);
    const meta = requireRecord(payload.channelData?.execApproval, "exec approval metadata");
    const slug = String(meta.approvalSlug);
    expect(typeof slug).toBe("string");
    expect(slug.length).toBeGreaterThan(0);

    // handleResolved should also succeed.
    deliver.mockClear();
    await forwarder.handleResolved({
      id: emojiId,
      decision: "allow-once",
      resolvedBy: "slack:U123",
      ts: 2000,
    });
    expect(deliver).toHaveBeenCalledTimes(1);
  });

  it("produces valid approval slugs for normal IDs", async () => {
    vi.useFakeTimers();
    const { deliver, forwarder } = createForwarder({ cfg: TARGETS_CFG });

    await expect(forwarder.handleRequested({ ...baseRequest, id: "req-abc123" })).resolves.toBe(
      true,
    );
    expect(deliver).toHaveBeenCalledTimes(1);

    const payload = requireFirstPayload(deliver);
    const meta = requireRecord(payload.channelData?.execApproval, "exec approval metadata");
    // Normal IDs should produce a slug (first 8 chars, safe).
    expect(meta.approvalSlug).toBe("req-abc1");
  });
});
