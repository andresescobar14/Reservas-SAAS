import { test } from "node:test";
import assert from "node:assert/strict";
import { createIsolatedAuthClient } from "../lib/isolated-auth-client";

const config = { url: "https://test-project.supabase.co", key: "public-test-key" };

test("El registro directo no envía un desafío PKCE incompatible con autoconfirmación", async () => {
  let requestBody: Record<string, unknown> | undefined;
  const fetcher: typeof fetch = async (_input, init) => {
    requestBody = JSON.parse(String(init?.body));
    return Response.json({
      access_token: "test-access-token",
      refresh_token: "test-refresh-token",
      expires_in: 3600,
      token_type: "bearer",
      user: { id: "owner-one", email: "owner@example.com" },
    });
  };
  const client = createIsolatedAuthClient(config, fetcher);
  const { data, error } = await client.auth.signUp({
    email: "owner@example.com",
    password: "test-only-password",
    options: { data: { company_name: "Test company" } },
  });
  assert.equal(error, null);
  assert.ok(data.session);
  assert.equal(requestBody?.code_challenge ?? null, null);
  assert.deepEqual(requestBody?.data, { company_name: "Test company" });
});

test("El código opcional no crea usuarios ni sustituye una sesión al solicitarlo", async () => {
  let requestBody: Record<string, unknown> | undefined;
  const fetcher: typeof fetch = async (_input, init) => {
    requestBody = JSON.parse(String(init?.body));
    return Response.json({});
  };
  const client = createIsolatedAuthClient(config, fetcher);
  const { error } = await client.auth.signInWithOtp({
    email: "owner@example.com",
    options: { shouldCreateUser: false },
  });
  assert.equal(error, null);
  assert.equal(requestBody?.create_user, false);
  assert.equal(requestBody?.email, "owner@example.com");
  assert.equal((await client.auth.getSession()).data.session, null);
});

test("Un límite de correo conserva el error del proveedor y no fabrica una sesión", async () => {
  const client = createIsolatedAuthClient(config, async () =>
    Response.json(
      { code: "over_email_send_rate_limit", msg: "Email rate limit exceeded" },
      { status: 429, headers: { "x-supabase-api-version": "2024-01-01" } },
    ),
  );
  const { error } = await client.auth.signInWithOtp({
    email: "owner@example.com",
    options: { shouldCreateUser: false },
  });
  assert.equal(error?.code, "over_email_send_rate_limit");
  assert.equal((await client.auth.getSession()).data.session, null);
});
