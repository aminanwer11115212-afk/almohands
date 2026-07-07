import { z } from "zod";

/** Common reusable Zod schemas for forms across the app. */

export const nonEmptyString = (label = "الحقل") =>
  z.string().trim().min(1, { message: `${label} مطلوب` });

export const emailSchema = z
  .string()
  .trim()
  .min(1, { message: "البريد الإلكتروني مطلوب" })
  .email({ message: "صيغة البريد الإلكتروني غير صحيحة" })
  .max(255, { message: "البريد الإلكتروني طويل جداً" });

export const passwordSchema = z
  .string()
  .min(6, { message: "كلمة المرور يجب أن تكون 6 أحرف على الأقل" })
  .max(72, { message: "كلمة المرور طويلة جداً" });

export const phoneSchema = z
  .string()
  .trim()
  .regex(/^[0-9+\-\s()]{6,20}$/, { message: "رقم الهاتف غير صالح" });

export const optionalPhone = z
  .string()
  .trim()
  .optional()
  .refine((v) => !v || /^[0-9+\-\s()]{6,20}$/.test(v), { message: "رقم الهاتف غير صالح" });

export const positiveNumber = (label = "القيمة") =>
  z.coerce
    .number({ message: `${label} يجب أن يكون رقماً` })
    .refine((n) => Number.isFinite(n), { message: `${label} غير صالح` })
    .refine((n) => n >= 0, { message: `${label} لا يمكن أن يكون سالباً` });

export const requiredPositiveNumber = (label = "القيمة") =>
  positiveNumber(label).refine((n) => n > 0, { message: `${label} يجب أن يكون أكبر من صفر` });

export const productSchema = z.object({
  name: nonEmptyString("اسم المنتج").max(200),
  barcode: z.string().trim().max(100).optional().or(z.literal("")),
  cost_price: positiveNumber("سعر الشراء"),
  price: positiveNumber("سعر البيع"),
  stock: positiveNumber("الكمية"),
});

export const customerSchema = z.object({
  name: nonEmptyString("اسم العميل").max(200),
  phone: z.string().trim().max(20).optional().or(z.literal("")),
  address: z.string().trim().max(500).optional().or(z.literal("")),
});

export const supplierSchema = customerSchema;

export const expenseSchema = z.object({
  description: nonEmptyString("الوصف").max(500),
  amount: requiredPositiveNumber("المبلغ"),
});
