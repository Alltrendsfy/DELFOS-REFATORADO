import { Router, Request, Response } from "express";
import { isAuthenticated } from "../../replitAuth";
import { storage } from "../../storage";

export function registerAuthRoutes(router: Router) {
    // GET /api/auth/user - Get current authenticated user
    router.get('/api/auth/user', isAuthenticated, async (req: any, res: Response) => {
        try {
            const userId = req.user.claims.sub;
            const user = await storage.getUser(userId);

            if (user) {
                res.json({
                    ...user,
                    mustChangePassword: user.mustChangePassword || false,
                    authProvider: user.authProvider || 'replit',
                });
            } else {
                res.status(404).json({ message: 'User not found' });
            }
        } catch (error) {
            console.error('Error fetching user:', error);
            res.status(500).json({ message: 'Failed to fetch user' });
        }
    });

    // GET /api/auth/debug - Debug endpoint to see session data
    router.get('/api/auth/debug', isAuthenticated, (req: any, res: Response) => {
        res.json({
            user: req.user,
            session: req.session,
            isAuthenticated: req.isAuthenticated()
        });
    });
}
