import { describe, test, expect } from "bun:test";
import { api, authenticatedApi, signUpTestUser, expectStatus } from "./helpers";

describe("API Integration Tests", () => {
  // Shared state for chaining tests (e.g., created resource IDs, auth tokens)
  let authToken: string;
  let userId: string;
  let clientId: string;
  let appointmentId: string;

  // ============ Auth Setup ============
  test("Sign up test user", async () => {
    const { token, user } = await signUpTestUser();
    authToken = token;
    userId = user.id;
    expect(authToken).toBeDefined();
    expect(userId).toBeDefined();
  });

  // ============ Business Profile Tests ============
  test("Get business profile", async () => {
    const res = await authenticatedApi("/api/business-profile", authToken);
    // Could be 200 if exists, or 404 if not created yet
    expect([200, 404].includes(res.status)).toBe(true);
  });

  test("Update business profile", async () => {
    const res = await authenticatedApi("/api/business-profile", authToken, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        businessName: "Test Business",
        businessType: "Salon",
      }),
    });
    await expectStatus(res, 200);
  });

  test("Get business profile after update", async () => {
    const res = await authenticatedApi("/api/business-profile", authToken);
    await expectStatus(res, 200);
  });

  // ============ Clients CRUD Tests ============
  test("Get all clients", async () => {
    const res = await authenticatedApi("/api/clients", authToken);
    await expectStatus(res, 200);
    const data = await res.json();
    expect(Array.isArray(data)).toBe(true);
  });

  test("Create a client", async () => {
    const res = await authenticatedApi("/api/clients", authToken, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "John Doe",
        phone: "555-1234",
        email: "john@example.com",
        notes: "Regular customer",
      }),
    });
    await expectStatus(res, 201);
    const data = await res.json();
    clientId = data.id;
    expect(data.name).toBe("John Doe");
  });

  test("Update a client", async () => {
    const res = await authenticatedApi(`/api/clients/${clientId}`, authToken, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "John Smith",
        phone: "555-5678",
      }),
    });
    await expectStatus(res, 200);
  });

  test("Update client with invalid UUID format - expect 400", async () => {
    const res = await authenticatedApi("/api/clients/invalid-uuid", authToken, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Test" }),
    });
    await expectStatus(res, 400);
  });

  test("Update nonexistent client - expect 404", async () => {
    const res = await authenticatedApi(
      "/api/clients/00000000-0000-0000-0000-000000000000",
      authToken,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Nonexistent" }),
      }
    );
    await expectStatus(res, 404);
  });

  test("Delete a client", async () => {
    const res = await authenticatedApi(`/api/clients/${clientId}`, authToken, {
      method: "DELETE",
    });
    await expectStatus(res, 200);
    const data = await res.json();
    expect(data.success).toBe(true);
  });

  test("Delete nonexistent client - expect 404", async () => {
    const res = await authenticatedApi(
      "/api/clients/00000000-0000-0000-0000-000000000000",
      authToken,
      {
        method: "DELETE",
      }
    );
    await expectStatus(res, 404);
  });

  test("Delete client with invalid UUID format - expect 400", async () => {
    const res = await authenticatedApi("/api/clients/invalid-uuid", authToken, {
      method: "DELETE",
    });
    await expectStatus(res, 400);
  });

  // ============ Appointments CRUD Tests ============
  test("Create a client for appointments", async () => {
    const res = await authenticatedApi("/api/clients", authToken, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Jane Doe",
        phone: "555-9999",
      }),
    });
    await expectStatus(res, 201);
    const data = await res.json();
    clientId = data.id;
  });

  test("Get all appointments", async () => {
    const res = await authenticatedApi("/api/appointments", authToken);
    await expectStatus(res, 200);
    const data = await res.json();
    expect(Array.isArray(data)).toBe(true);
  });

  test("Create an appointment", async () => {
    const res = await authenticatedApi("/api/appointments", authToken, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientId: clientId,
        date: "2026-03-05",
        time: "10:00",
        service: "Haircut",
        status: "scheduled",
        notes: "Customer prefers short hair",
      }),
    });
    await expectStatus(res, 201);
    const data = await res.json();
    appointmentId = data.id;
    expect(data.clientId).toBe(clientId);
  });

  test("Get today's appointments", async () => {
    const res = await authenticatedApi("/api/appointments/today", authToken);
    await expectStatus(res, 200);
    const data = await res.json();
    expect(Array.isArray(data)).toBe(true);
  });

  test("Update an appointment", async () => {
    const res = await authenticatedApi(
      `/api/appointments/${appointmentId}`,
      authToken,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          service: "Haircut + Color",
          status: "confirmed",
        }),
      }
    );
    await expectStatus(res, 200);
  });

  test("Update appointment with invalid UUID format - expect 400", async () => {
    const res = await authenticatedApi(
      "/api/appointments/invalid-uuid",
      authToken,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "completed" }),
      }
    );
    await expectStatus(res, 400);
  });

  test("Update nonexistent appointment - expect 404", async () => {
    const res = await authenticatedApi(
      "/api/appointments/00000000-0000-0000-0000-000000000000",
      authToken,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "completed" }),
      }
    );
    await expectStatus(res, 404);
  });

  test("Delete an appointment", async () => {
    const res = await authenticatedApi(
      `/api/appointments/${appointmentId}`,
      authToken,
      {
        method: "DELETE",
      }
    );
    await expectStatus(res, 200);
    const data = await res.json();
    expect(data.success).toBe(true);
  });

  test("Delete nonexistent appointment - expect 404", async () => {
    const res = await authenticatedApi(
      "/api/appointments/00000000-0000-0000-0000-000000000000",
      authToken,
      {
        method: "DELETE",
      }
    );
    await expectStatus(res, 404);
  });

  test("Delete appointment with invalid UUID format - expect 400", async () => {
    const res = await authenticatedApi(
      "/api/appointments/invalid-uuid",
      authToken,
      {
        method: "DELETE",
      }
    );
    await expectStatus(res, 400);
  });

  // ============ Stats Tests ============
  test("Get dashboard statistics", async () => {
    const res = await authenticatedApi("/api/stats/dashboard", authToken);
    await expectStatus(res, 200);
    const data = await res.json();
    expect(typeof data.todayAppointments).toBe("number");
    expect(typeof data.totalClients).toBe("number");
    expect(typeof data.totalAppointments).toBe("number");
  });

  // ============ Auth Failure Tests ============
  test("Get business profile without auth - expect 401", async () => {
    const res = await api("/api/business-profile");
    await expectStatus(res, 401);
  });

  test("Get appointments without auth - expect 401", async () => {
    const res = await api("/api/appointments");
    await expectStatus(res, 401);
  });

  test("Get clients without auth - expect 401", async () => {
    const res = await api("/api/clients");
    await expectStatus(res, 401);
  });

  test("Get stats without auth - expect 401", async () => {
    const res = await api("/api/stats/dashboard");
    await expectStatus(res, 401);
  });
});
