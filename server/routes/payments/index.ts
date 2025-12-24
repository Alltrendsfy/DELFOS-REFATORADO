import { Router } from "express";

export function registerPaymentRoutes(router: Router) {
    // Get Stripe publishable key (public, required for frontend)
    router.get('/api/stripe/publishable-key', async (req: any, res) => {
        try {
            const { getStripePublishableKey } = await import('../../services/payments/stripeClient');
            const publishableKey = await getStripePublishableKey();
            res.json({ publishableKey });
        } catch (error: any) {
            console.error("[Stripe] Error getting publishable key:", error);
            res.status(500).json({ message: "Stripe not configured" });
        }
    });

    // Create Stripe Checkout Session for franchise payment
    router.post('/api/franchise-leads/:leadId/checkout', async (req: any, res) => {
        try {
            const { leadId } = req.params;
            const { planId } = req.body;

            if (!leadId || !planId) {
                return res.status(400).json({ message: "Lead ID and Plan ID are required" });
            }

            const { franchisePaymentService } = await import('../../services/payments/franchisePaymentService');

            const baseUrl = `https://${process.env.REPLIT_DOMAINS?.split(',')[0]}`;
            const successUrl = `${baseUrl}/franchise/payment-success`;
            const cancelUrl = `${baseUrl}/franchise`;

            const session = await franchisePaymentService.createCheckoutSession(
                leadId,
                planId,
                successUrl,
                cancelUrl
            );

            res.json({
                checkoutUrl: session.url,
                sessionId: session.id
            });
        } catch (error: any) {
            console.error("[Stripe Checkout] Error:", error);
            res.status(500).json({ message: error.message || "Failed to create checkout session" });
        }
    });

    // Verify payment status for a lead
    router.get('/api/franchise-leads/:leadId/payment-status', async (req: any, res) => {
        try {
            const { leadId } = req.params;

            const { franchisePaymentService } = await import('../../services/payments/franchisePaymentService');
            const status = await franchisePaymentService.verifyPaymentStatus(leadId);

            res.json(status);
        } catch (error: any) {
            console.error("[Stripe Payment Status] Error:", error);
            res.status(500).json({ message: error.message || "Failed to get payment status" });
        }
    });

    // Handle payment success callback (verify and update lead)
    router.post('/api/franchise-leads/:leadId/payment-success', async (req: any, res) => {
        try {
            const { leadId } = req.params;
            const { sessionId } = req.body;

            if (!sessionId) {
                return res.status(400).json({ message: "Session ID is required" });
            }

            const { franchisePaymentService } = await import('../../services/payments/franchisePaymentService');
            await franchisePaymentService.handlePaymentSuccess(sessionId);

            const status = await franchisePaymentService.verifyPaymentStatus(leadId);

            res.json({
                success: true,
                ...status
            });
        } catch (error: any) {
            console.error("[Stripe Payment Success] Error:", error);
            res.status(500).json({ message: error.message || "Failed to verify payment" });
        }
    });
}
