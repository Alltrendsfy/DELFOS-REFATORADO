import { Router, Response } from "express";
import { db } from "../../db";
import { master_leads } from "@shared/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { nanoid } from "nanoid";

// Validation schema matching the frontend form
const masterLeadSchema = z.object({
    name: z.string().min(3),
    email: z.string().email(),
    phone: z.string().optional(),
    territory: z.string().min(3),
    documentType: z.string(),
    documentNumber: z.string().min(5),
    addressCity: z.string().optional(),
    addressCountry: z.string().default("BRA"),
    notes: z.string().optional(),
});

export function registerMasterLeadsRoutes(router: Router) {

    // POST /api/master-leads/register
    router.post('/api/master-leads/register', async (req: any, res: Response) => {
        try {
            // Validate input
            const data = masterLeadSchema.parse(req.body);

            // Check for existing email to prevent duplicates
            const existing = await db.select().from(master_leads).where(eq(master_leads.email, data.email)).limit(1);
            if (existing.length > 0) {
                return res.status(400).json({ message: "Email already registered" });
            }

            // Generate a unique master code
            const masterCode = `MASTER-${nanoid(8).toUpperCase()}`;

            // Insert into database
            const [lead] = await db.insert(master_leads).values({
                master_code: masterCode,
                name: data.name,
                email: data.email,
                phone: data.phone,
                territory: data.territory,
                document_type: data.documentType,
                document_number: data.documentNumber,
                address_city: data.addressCity,
                address_country: data.addressCountry,
                notes: data.notes,
                status: "pending",
                source: "landing_page",
                ip_address: req.ip,
                user_agent: req.headers['user-agent'] as string,
            }).returning();

            res.status(201).json({
                success: true,
                message: "Application submitted successfully",
                masterCode: lead.master_code,
                leadId: lead.id
            });

        } catch (error: any) {
            if (error instanceof z.ZodError) {
                return res.status(400).json({ message: "Validation failed", errors: error.errors });
            }
            console.error("Error registering master lead:", error);
            res.status(500).json({ message: "Failed to submit application" });
        }
    });
}
