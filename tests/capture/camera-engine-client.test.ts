import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createCameraEngineClient, CameraEngineClientError, explainEngineFailure } from '../../src/capture/camera-engine-client.ts';
import { parseCameraEngineResult, serializeCameraEngineResult } from '../../src/capture/camera-engine-contract.ts';

function wireResult(): Record<string, unknown> {
  return {
    schema_version: 'parinaam-camera-engine-v1',
    status: 'PASS',
    image: { sha256: 'b'.repeat(64), bytes: 1234, width_px: 1920, height_px: 1080 },
    profile: {
      kit_profile_id: 'mvp_test1_mock_cannabinoid',
      status: 'VALIDATED',
      demo_mode: false,
      classification_capable: true,
      source: 'card_v1_geometry.yaml',
    },
    requested_reagent: 'duquenois_levine',
    quality: { status: 'PASS', failure_codes: [], diagnostics: {} },
    calibration: {
      method: 'ROOT_POLYNOMIAL_SRGB_LINEAR_V1',
      rank: 7,
      coefficients: [[0, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0, 0]],
      fit_residual_delta_e00: 1.1,
      max_fit_residual_delta_e00: 2,
      patch_count: 16,
      grade: 'GOOD',
    },
    raw_color: { lab: { L: 40, a: 20, b: -30 }, linear_rgb: [0.1, 0.2, 0.3], sampling: {} },
    normalized_color: { lab: { L: 41, a: 24, b: -38 }, delta_e00_to_card_mean: null },
    classification: {
      status: 'MATCH',
      outcome: 'CONSISTENT_WITH_REAGENT_POSITIVE',
      reason: null,
      confidence: 0.8,
      confidence_uncalibrated: true,
      best_delta_e00: 3,
      margin_delta_e00: 8,
      distances: [
        { label: 'CONSISTENT_WITH_REAGENT_POSITIVE', delta_e00: 3, tolerance_delta_e00: 8, within_tolerance: true },
        { label: 'CONSISTENT_WITH_REAGENT_NEGATIVE', delta_e00: 11, tolerance_delta_e00: 8, within_tolerance: false },
      ],
    },
    diagnostics: {},
  };
}

function response(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

describe('camera-engine bounded client', () => {
  it('uploads a camera URI and validates the returned structured result', async () => {
    let calls = 0;
    const fakeFetch = (async (_url: string, init?: RequestInit) => {
      calls += 1;
      assert.ok(init?.body instanceof FormData);
      return response(200, wireResult());
    }) as unknown as typeof fetch;
    const client = createCameraEngineClient({ baseUrl: 'http://engine.local:8572', fetchImpl: fakeFetch });
    const result = await client.analyzeImage({ uri: 'file:///capture.jpg', mimeType: 'image/jpeg', reagent: 'duquenois_levine' });
    assert.equal(calls, 1);
    assert.equal(result.image.sha256, 'b'.repeat(64));
    assert.equal(result.classification.outcome, 'CONSISTENT_WITH_REAGENT_POSITIVE');
  });

  it('round-trips the validated result through the local append-only wire representation', async () => {
    const client = createCameraEngineClient({
      baseUrl: 'http://engine.local',
      fetchImpl: (async () => response(200, wireResult())) as unknown as typeof fetch,
    });
    const result = await client.analyzeImage({ uri: 'file:///capture.jpg', mimeType: 'image/jpeg', reagent: 'duquenois_levine' });
    const restored = parseCameraEngineResult(JSON.parse(JSON.stringify(serializeCameraEngineResult(result))) as unknown);
    assert.deepEqual(restored, result);
  });

  it('retries transient gateway failures and does not retry deterministic client errors', async () => {
    let retryableCalls = 0;
    const retryFetch = (async () => {
      retryableCalls += 1;
      return retryableCalls === 1 ? response(503, { error: 'not-ready' }) : response(200, wireResult());
    }) as unknown as typeof fetch;
    const client = createCameraEngineClient({ baseUrl: 'http://engine.local', fetchImpl: retryFetch });
    await client.analyzeImage({ uri: 'file:///capture.jpg', mimeType: 'image/jpeg', reagent: 'duquenois_levine' });
    assert.equal(retryableCalls, 2);

    let permanentCalls = 0;
    const permanentFetch = (async () => {
      permanentCalls += 1;
      return response(400, { error: 'CORRUPT_IMAGE' });
    }) as unknown as typeof fetch;
    const permanentClient = createCameraEngineClient({ baseUrl: 'http://engine.local', fetchImpl: permanentFetch });
    await assert.rejects(
      () => permanentClient.analyzeImage({ uri: 'file:///capture.jpg', mimeType: 'image/jpeg', reagent: 'duquenois_levine' }),
      (error: unknown) => error instanceof CameraEngineClientError && error.kind === 'http' && !error.retryable,
    );
    assert.equal(permanentCalls, 1);
  });

  it('times out a hung request and rejects invalid URLs before fetching', async () => {
    const hangingFetch = ((_url: string, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
      })) as unknown as typeof fetch;
    const client = createCameraEngineClient({
      baseUrl: 'http://engine.local',
      fetchImpl: hangingFetch,
      requestTimeoutMs: 10,
    });
    await assert.rejects(
      () => client.analyzeImage({ uri: 'file:///capture.jpg', mimeType: 'image/jpeg', reagent: 'duquenois_levine' }),
      (error: unknown) => error instanceof CameraEngineClientError && error.kind === 'timeout',
    );
    assert.throws(
      () => createCameraEngineClient({ baseUrl: 'file:///engine', fetchImpl: hangingFetch }),
      (error: unknown) => error instanceof CameraEngineClientError && error.kind === 'invalid_url',
    );
  });
});

describe('camera-engine failure explanations', () => {
  it('translates an oversized photo into an instruction, not a code', async () => {
    const tooLargeFetch = (async () =>
      response(413, { error: 'IMAGE_TOO_LARGE', max_bytes: 12 * 1024 * 1024 })) as unknown as typeof fetch;
    const client = createCameraEngineClient({ baseUrl: 'http://engine.local', fetchImpl: tooLargeFetch, maxAttempts: 1 });
    const failure = await client
      .analyzeImage({ uri: 'file:///capture.jpg', mimeType: 'image/jpeg', reagent: 'duquenois_levine' })
      .then(() => null, (error: unknown) => explainEngineFailure(error));
    assert.ok(failure);
    assert.equal(failure.code, 'IMAGE_TOO_LARGE');
    assert.match(failure.message, /larger than the local engine can accept/i);
    assert.match(failure.action, /retake/i);
  });

  it('explains an unreadable image format without inventing a cause', async () => {
    const badFormat = new CameraEngineClientError('UNSUPPORTED_IMAGE_FORMAT', 'http', {
      status: 415,
      body: { error: 'UNSUPPORTED_IMAGE_FORMAT' },
    });
    const failure = explainEngineFailure(badFormat);
    assert.equal(failure.code, 'UNSUPPORTED_IMAGE_FORMAT');
    assert.match(failure.action, /JPEG and PNG/i);
  });

  it('explains a generic engine processing failure honestly', () => {
    const failure = explainEngineFailure(
      new CameraEngineClientError('ENGINE_PROCESSING_ERROR', 'http', {
        status: 500,
        body: { error: 'ENGINE_PROCESSING_ERROR' },
      }),
    );
    assert.equal(failure.code, 'ENGINE_PROCESSING_ERROR');
    assert.match(failure.message, /could not measure this photo/i);
    // A 500 is not auto-retried: the same photo would fail again, so the
    // instruction is to retake rather than to resend.
    assert.equal(failure.retryable, false);
  });

  it('tells the officer what to do when the engine cannot be reached', () => {
    const failure = explainEngineFailure(new CameraEngineClientError('Network request failed', 'network'));
    assert.equal(failure.code, 'ENGINE_UNREACHABLE');
    assert.match(failure.message, /could not be reached/i);
    assert.match(failure.action, /same Wi-Fi/i);
  });

  it('points a bad engine URL at Settings', () => {
    const failure = explainEngineFailure(new CameraEngineClientError('Camera-engine URL must use HTTP or HTTPS', 'invalid_url'));
    assert.match(failure.action, /Settings/i);
    assert.equal(failure.retryable, false);
  });

  it('never shows a raw machine code as the officer-facing sentence', () => {
    const codes = ['IMAGE_TOO_LARGE', 'UNSUPPORTED_IMAGE_FORMAT', 'ENGINE_PROCESSING_ERROR'];
    for (const code of codes) {
      const failure = explainEngineFailure(new CameraEngineClientError(code, 'http', { status: 500, body: { error: code } }));
      assert.ok(!failure.message.includes('_'), `message must not leak the code: ${failure.message}`);
      assert.ok(failure.message.endsWith('.'), 'message must read as a sentence');
    }
  });
});
