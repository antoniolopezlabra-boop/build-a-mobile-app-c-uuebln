import { describe, test, expect } from "bun:test";
import { api, authenticatedApi, signUpTestUser, expectStatus, createTestFile } from "./helpers";

describe("API Integration Tests", () => {
  // Shared state for chaining tests (e.g., created resource IDs, auth tokens)
  let authToken: string;
  let userId: string;
  let clientId: string;
  let serviceId: string;
  let appointmentId: string;

  // ============ Auth Setup ============
  test("Sign up test user", async () => {
    const { token, user } = await signUpTestUser();
    authToken = token;
    userId = user.id;
    expect(authToken).toBeDefined();
    expect(userId).toBeDefined();
  });

  test("Get current user info via /api/auth/me", async () => {
    const res = await authenticatedApi("/api/auth/me", authToken);
    await expectStatus(res, 200);
    const data = await res.json();
    expect(data.user).toBeDefined();
    expect(data.user.id).toBe(userId);
    expect(data.user.email).toBeDefined();
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

  test("Upload business logo", async () => {
    const form = new FormData();
    form.append("file", createTestFile("logo.png", "fake png content", "image/png"));
    const res = await authenticatedApi("/api/business-profile/upload-logo", authToken, {
      method: "POST",
      body: form,
    });
    await expectStatus(res, 200);
    const data = await res.json();
    expect(data.logoUrl).toBeDefined();
  });

  test("Upload logo without auth - expect 401", async () => {
    const form = new FormData();
    form.append("file", createTestFile("logo.png", "fake png content", "image/png"));
    const res = await api("/api/business-profile/upload-logo", {
      method: "POST",
      body: form,
    });
    await expectStatus(res, 401);
  });

  // ============ Services CRUD Tests ============
  test("Get all services", async () => {
    const res = await authenticatedApi("/api/services", authToken);
    await expectStatus(res, 200);
    const data = await res.json();
    expect(Array.isArray(data)).toBe(true);
  });

  test("Create a service", async () => {
    const res = await authenticatedApi("/api/services", authToken, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Haircut",
        duration: 30,
        price: "25.00",
        description: "Standard haircut service",
      }),
    });
    await expectStatus(res, 201);
    const data = await res.json();
    serviceId = data.id;
    expect(data.name).toBe("Haircut");
  });

  test("Create service without required fields - expect 400", async () => {
    const res = await authenticatedApi("/api/services", authToken, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Incomplete Service",
        // missing required 'duration' field
      }),
    });
    await expectStatus(res, 400);
  });

  test("Update a service", async () => {
    const res = await authenticatedApi(`/api/services/${serviceId}`, authToken, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Haircut Premium",
        duration: 45,
        price: "35.00",
      }),
    });
    await expectStatus(res, 200);
  });

  test("Update service with invalid UUID format - expect 400", async () => {
    const res = await authenticatedApi("/api/services/invalid-uuid", authToken, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Test" }),
    });
    await expectStatus(res, 400);
  });

  test("Update nonexistent service - expect 404", async () => {
    const res = await authenticatedApi(
      "/api/services/00000000-0000-0000-0000-000000000000",
      authToken,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Nonexistent" }),
      }
    );
    await expectStatus(res, 404);
  });

  // ============ Clients CRUD Tests ============
  test("Get all clients", async () => {
    const res = await authenticatedApi("/api/clients", authToken);
    await expectStatus(res, 200);
    const data = await res.json();
    expect(Array.isArray(data)).toBe(true);
  });

  test("Get clients with search parameter", async () => {
    const res = await authenticatedApi("/api/clients?search=John", authToken);
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

  test("Create client without required fields - expect 400", async () => {
    const res = await authenticatedApi("/api/clients", authToken, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Incomplete Client",
        // missing required 'phone' field
      }),
    });
    await expectStatus(res, 400);
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

  test("Get inactive clients", async () => {
    const res = await authenticatedApi("/api/clients/inactive", authToken);
    await expectStatus(res, 200);
    const data = await res.json();
    expect(Array.isArray(data)).toBe(true);
  });

  test("Get client appointment history", async () => {
    const res = await authenticatedApi(`/api/clients/${clientId}/appointments`, authToken);
    await expectStatus(res, 200);
    const data = await res.json();
    expect(Array.isArray(data)).toBe(true);
  });

  test("Get client appointment history for nonexistent client - expect 404", async () => {
    const res = await authenticatedApi(
      "/api/clients/00000000-0000-0000-0000-000000000000/appointments",
      authToken
    );
    await expectStatus(res, 404);
  });

  test("Get client statistics", async () => {
    const res = await authenticatedApi(`/api/clients/${clientId}/stats`, authToken);
    await expectStatus(res, 200);
    const data = await res.json();
    expect(typeof data.totalAppointments).toBe("number");
    expect(typeof data.attendanceRate).toBe("number");
  });

  test("Get client statistics for nonexistent client - expect 404", async () => {
    const res = await authenticatedApi(
      "/api/clients/00000000-0000-0000-0000-000000000000/stats",
      authToken
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

  // ============ Business Hours Tests ============
  test("Get business hours", async () => {
    const res = await authenticatedApi("/api/business-hours", authToken);
    await expectStatus(res, 200);
    const data = await res.json();
    expect(Array.isArray(data)).toBe(true);
  });

  test("Update business hours for Monday", async () => {
    const res = await authenticatedApi("/api/business-hours/1", authToken, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        startTime: "09:00",
        endTime: "17:00",
        isOpen: true,
      }),
    });
    await expectStatus(res, 200);
  });

  test("Update business hours for Sunday (closed)", async () => {
    const res = await authenticatedApi("/api/business-hours/0", authToken, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        startTime: "00:00",
        endTime: "00:00",
        isOpen: false,
      }),
    });
    await expectStatus(res, 200);
  });

  test("Update business hours with invalid day - expect 400", async () => {
    const res = await authenticatedApi("/api/business-hours/8", authToken, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        startTime: "09:00",
        endTime: "17:00",
        isOpen: true,
      }),
    });
    await expectStatus(res, 400);
  });

  test("Update business hours without required fields - expect 400", async () => {
    const res = await authenticatedApi("/api/business-hours/1", authToken, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        startTime: "09:00",
        // missing required 'endTime' and 'isOpen'
      }),
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
        serviceId: serviceId,
        date: "2026-03-05",
        startTime: "10:00",
        endTime: "10:30",
        notes: "Customer prefers morning slot",
      }),
    });
    await expectStatus(res, 201);
    const data = await res.json();
    appointmentId = data.id;
    expect(data.clientId).toBe(clientId);
  });

  test("Create appointment without required fields - expect 400", async () => {
    const res = await authenticatedApi("/api/appointments", authToken, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientId: clientId,
        // missing required serviceId, date, startTime, endTime
      }),
    });
    await expectStatus(res, 400);
  });

  test("Get appointment by ID", async () => {
    const res = await authenticatedApi(
      `/api/appointments/${appointmentId}`,
      authToken
    );
    await expectStatus(res, 200);
    const data = await res.json();
    expect(data.id).toBe(appointmentId);
  });

  test("Get appointment with invalid UUID format - expect 400", async () => {
    const res = await authenticatedApi(
      "/api/appointments/invalid-uuid",
      authToken
    );
    await expectStatus(res, 400);
  });

  test("Get nonexistent appointment - expect 404", async () => {
    const res = await authenticatedApi(
      "/api/appointments/00000000-0000-0000-0000-000000000000",
      authToken
    );
    await expectStatus(res, 404);
  });

  test("Get today's appointments", async () => {
    const res = await authenticatedApi("/api/appointments/today", authToken);
    await expectStatus(res, 200);
    const data = await res.json();
    expect(Array.isArray(data)).toBe(true);
  });

  test("Get appointments filtered by date", async () => {
    const res = await authenticatedApi(
      `/api/appointments?date=2026-03-05`,
      authToken
    );
    await expectStatus(res, 200);
    const data = await res.json();
    expect(Array.isArray(data)).toBe(true);
  });

  test("Get appointments filtered by month", async () => {
    const res = await authenticatedApi(
      `/api/appointments?month=2026-03`,
      authToken
    );
    await expectStatus(res, 200);
    const data = await res.json();
    expect(Array.isArray(data)).toBe(true);
  });

  test("Get appointments filtered by week", async () => {
    const res = await authenticatedApi(
      `/api/appointments?week=2026-03-01`,
      authToken
    );
    await expectStatus(res, 200);
    const data = await res.json();
    expect(Array.isArray(data)).toBe(true);
  });

  test("Update appointment status to Confirmada", async () => {
    const res = await authenticatedApi(
      `/api/appointments/${appointmentId}/status`,
      authToken,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "Confirmada",
        }),
      }
    );
    await expectStatus(res, 200);
    const data = await res.json();
    expect(data.status).toBe("Confirmada");
  });

  test("Update appointment status with invalid status - expect 400", async () => {
    const res = await authenticatedApi(
      `/api/appointments/${appointmentId}/status`,
      authToken,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "InvalidStatus",
        }),
      }
    );
    await expectStatus(res, 400);
  });

  test("Reschedule appointment", async () => {
    const res = await authenticatedApi(
      `/api/appointments/${appointmentId}/reschedule`,
      authToken,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: "2026-03-06",
          startTime: "11:00",
          endTime: "11:30",
        }),
      }
    );
    await expectStatus(res, 200);
  });

  test("Reschedule appointment without required fields - expect 400", async () => {
    const res = await authenticatedApi(
      `/api/appointments/${appointmentId}/reschedule`,
      authToken,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: "2026-03-07",
          // missing required startTime and endTime
        }),
      }
    );
    await expectStatus(res, 400);
  });

  test("Get available slots for a date and service", async () => {
    const res = await authenticatedApi(
      `/api/appointments/available-slots?date=2026-03-10&serviceId=${serviceId}`,
      authToken
    );
    await expectStatus(res, 200);
    const data = await res.json();
    expect(Array.isArray(data)).toBe(true);
  });

  test("Get available slots without required parameters - expect 400", async () => {
    const res = await authenticatedApi(
      "/api/appointments/available-slots",
      authToken
    );
    await expectStatus(res, 400);
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

  // ============ Delete Service ============
  test("Delete a service", async () => {
    const res = await authenticatedApi(`/api/services/${serviceId}`, authToken, {
      method: "DELETE",
    });
    await expectStatus(res, 200);
    const data = await res.json();
    expect(data.success).toBe(true);
  });

  test("Delete nonexistent service - expect 404", async () => {
    const res = await authenticatedApi(
      "/api/services/00000000-0000-0000-0000-000000000000",
      authToken,
      {
        method: "DELETE",
      }
    );
    await expectStatus(res, 404);
  });

  test("Delete service with invalid UUID format - expect 400", async () => {
    const res = await authenticatedApi("/api/services/invalid-uuid", authToken, {
      method: "DELETE",
    });
    await expectStatus(res, 400);
  });

  // ============ WhatsApp Config Tests ============
  test("Get WhatsApp configuration", async () => {
    const res = await authenticatedApi("/api/whatsapp-config", authToken);
    await expectStatus(res, 200);
    const data = await res.json();
    // Can be null or object with config
    expect(data === null || typeof data === "object").toBe(true);
  });

  test("Update WhatsApp configuration", async () => {
    const res = await authenticatedApi("/api/whatsapp-config", authToken, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        apiKey: "test-api-key",
        phoneNumber: "1234567890",
        isConnected: false,
        reminder24h: true,
        reminder2h: true,
      }),
    });
    await expectStatus(res, 200);
    const data = await res.json();
    expect(data.id).toBeDefined();
  });

  test("Verify WhatsApp configuration", async () => {
    const res = await authenticatedApi("/api/whatsapp-config/verify", authToken, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        apiKey: "test-api-key",
        phoneNumber: "1234567890",
      }),
    });
    // Could be 200 or 400 depending on whether credentials are valid
    expect([200, 400].includes(res.status)).toBe(true);
  });

  test("Verify WhatsApp config without required fields - expect 400", async () => {
    const res = await authenticatedApi("/api/whatsapp-config/verify", authToken, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        apiKey: "test-api-key",
        // missing required phoneNumber
      }),
    });
    await expectStatus(res, 400);
  });

  // ============ Subscription Tests ============
  test("Get subscription plan", async () => {
    const res = await authenticatedApi("/api/subscription", authToken);
    await expectStatus(res, 200);
    const data = await res.json();
    expect(data.planType).toBeDefined();
    expect(data.userId).toBeDefined();
  });

  test("Update subscription plan to Premium", async () => {
    const res = await authenticatedApi("/api/subscription", authToken, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        planType: "Premium",
      }),
    });
    await expectStatus(res, 200);
    const data = await res.json();
    expect(data.planType).toBe("Premium");
  });

  test("Update subscription plan to Básico", async () => {
    const res = await authenticatedApi("/api/subscription", authToken, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        planType: "Básico",
      }),
    });
    await expectStatus(res, 200);
    const data = await res.json();
    expect(data.planType).toBe("Básico");
  });

  test("Update subscription with invalid plan type - expect 400", async () => {
    const res = await authenticatedApi("/api/subscription", authToken, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        planType: "InvalidPlan",
      }),
    });
    await expectStatus(res, 400);
  });

  test("Update subscription without required fields - expect 400", async () => {
    const res = await authenticatedApi("/api/subscription", authToken, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
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
  test("Get auth/me without auth - expect 401", async () => {
    const res = await api("/api/auth/me");
    await expectStatus(res, 401);
  });

  test("Get business profile without auth - expect 401", async () => {
    const res = await api("/api/business-profile");
    await expectStatus(res, 401);
  });

  test("Update business profile without auth - expect 401", async () => {
    const res = await api("/api/business-profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ businessName: "Test" }),
    });
    await expectStatus(res, 401);
  });

  test("Get clients without auth - expect 401", async () => {
    const res = await api("/api/clients");
    await expectStatus(res, 401);
  });

  test("Create client without auth - expect 401", async () => {
    const res = await api("/api/clients", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Test", phone: "123" }),
    });
    await expectStatus(res, 401);
  });

  test("Get services without auth - expect 401", async () => {
    const res = await api("/api/services");
    await expectStatus(res, 401);
  });

  test("Create service without auth - expect 401", async () => {
    const res = await api("/api/services", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Test", duration: 30 }),
    });
    await expectStatus(res, 401);
  });

  test("Get business hours without auth - expect 401", async () => {
    const res = await api("/api/business-hours");
    await expectStatus(res, 401);
  });

  test("Update business hours without auth - expect 401", async () => {
    const res = await api("/api/business-hours/1", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        startTime: "09:00",
        endTime: "17:00",
        isOpen: true,
      }),
    });
    await expectStatus(res, 401);
  });

  test("Get appointments without auth - expect 401", async () => {
    const res = await api("/api/appointments");
    await expectStatus(res, 401);
  });

  test("Create appointment without auth - expect 401", async () => {
    const res = await api("/api/appointments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientId: "00000000-0000-0000-0000-000000000000",
        serviceId: "00000000-0000-0000-0000-000000000000",
        date: "2026-03-05",
        startTime: "10:00",
        endTime: "10:30",
      }),
    });
    await expectStatus(res, 401);
  });

  test("Get WhatsApp config without auth - expect 401", async () => {
    const res = await api("/api/whatsapp-config");
    await expectStatus(res, 401);
  });

  test("Update WhatsApp config without auth - expect 401", async () => {
    const res = await api("/api/whatsapp-config", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ apiKey: "test" }),
    });
    await expectStatus(res, 401);
  });

  test("Verify WhatsApp config without auth - expect 401", async () => {
    const res = await api("/api/whatsapp-config/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ apiKey: "test", phoneNumber: "123" }),
    });
    await expectStatus(res, 401);
  });

  test("Get subscription without auth - expect 401", async () => {
    const res = await api("/api/subscription");
    await expectStatus(res, 401);
  });

  test("Update subscription without auth - expect 401", async () => {
    const res = await api("/api/subscription", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ planType: "Premium" }),
    });
    await expectStatus(res, 401);
  });

  test("Get stats without auth - expect 401", async () => {
    const res = await api("/api/stats/dashboard");
    await expectStatus(res, 401);
  });
});
