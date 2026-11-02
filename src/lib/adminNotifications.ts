import "server-only";
import { dbConnect } from "./mongodb";
import { UserModel } from "@/models/User";
import { AdminNotificationSettingModel } from "@/models/AdminNotificationSetting";
import { sendNewCustomerRegistrationEmail } from "./mail";
import { SITE_URL } from "./utils";

// Free-form string, same convention as ActivityLog.type — a future
// notification type is just a new constant + a new call site, never a
// schema migration on AdminNotificationSetting.
export const NOTIFICATION_TYPE_CUSTOMER_REGISTERED = "customer_registered";

interface RegisteredCustomer {
  _id: unknown;
  email: string;
  firstName?: string;
  lastName?: string;
  createdAt?: Date;
}

// Fire-and-forget by design, same contract as logActivity(): never throws,
// never awaited by its caller (see /api/auth/register), so a slow or
// failing notification send can't add latency to — or break — the
// customer's actual registration response. Internally: no admin has this
// notification enabled → no-op, no query for admin details at all.
export async function notifyAdminsOfCustomerRegistration(customer: RegisteredCustomer): Promise<void> {
  try {
    await dbConnect();

    const settings = await AdminNotificationSettingModel.find({
      type: NOTIFICATION_TYPE_CUSTOMER_REGISTERED,
      enabled: true,
    }).select("adminUser").lean();
    if (!settings.length) return;

    const adminIds = settings.map((s: any) => s.adminUser);
    // status: "active" so a disabled admin account doesn't keep getting
    // emailed just because its notification row was never explicitly
    // turned off — mirrors the same status gate verifyAdminCredentials/
    // getAdminSession already apply everywhere else.
    const admins = await UserModel.find({ _id: { $in: adminIds }, role: "admin", status: "active" }).select("email").lean();
    if (!admins.length) return;

    const name = [customer.firstName, customer.lastName].filter(Boolean).join(" ");
    const customerId = String(customer._id);
    const profileUrl = new URL(`/admin/customers/${customerId}`, SITE_URL).toString();
    const registeredAt = (customer.createdAt ?? new Date()).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });

    await Promise.all(
      admins
        .filter((a: any) => !!a.email)
        .map((a: any) =>
          sendNewCustomerRegistrationEmail(a.email, { name, email: customer.email, registeredAt, customerId, profileUrl }).catch((err) => {
            console.error(`[adminNotifications] Failed to notify ${a.email} of new customer registration:`, err instanceof Error ? err.message : err);
          })
        )
    );
  } catch (err) {
    console.error("[adminNotifications] notifyAdminsOfCustomerRegistration failed:", err instanceof Error ? err.message : err);
  }
}
