import { useState } from "react";
import { Button } from "@/components/ui/button";
import { DelfosLogo } from "@/components/DelfosLogo";
import { LogIn } from "lucide-react";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";

interface LoginModalProps {
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
}

export function LoginModal({ isOpen, onOpenChange }: LoginModalProps) {
    const { toast } = useToast();
    const [, setLocation] = useLocation();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [isLoggingIn, setIsLoggingIn] = useState(false);

    const handleLogin = async () => {
        if (!email || !password) {
            toast({ title: "Error", description: "Email and password required", variant: "destructive" });
            return;
        }

        setIsLoggingIn(true);
        try {
            const response = await fetch('/api/franchisor-login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password }),
            });

            if (!response.ok) {
                throw new Error('Invalid credentials');
            }

            const data = await response.json();
            localStorage.setItem('franchisor_token', data.token);
            localStorage.setItem('franchisor_user', JSON.stringify(data.user));
            onOpenChange(false);
            setEmail('');
            setPassword('');
            setLocation('/franchisor-dashboard');
            toast({ title: "Success", description: "Welcome back!" });
        } catch (error) {
            toast({ title: "Error", description: "Login failed", variant: "destructive" });
        } finally {
            setIsLoggingIn(false);
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader className="text-center sm:text-center">
                    <div className="flex justify-center mb-4">
                        <DelfosLogo variant="icon" className="w-16 h-16" />
                    </div>
                    <DialogTitle className="text-2xl font-bold">
                        Acesso Franqueadora
                    </DialogTitle>
                    <DialogDescription className="text-base mt-2">
                        Faça login com suas credenciais
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-4">
                    <input
                        type="email"
                        placeholder="Email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="w-full px-3 py-2 border border-input rounded-md text-sm"
                        data-testid="input-franchisor-email"
                    />
                    <input
                        type="password"
                        placeholder="Senha"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="w-full px-3 py-2 border border-input rounded-md text-sm"
                        onKeyPress={(e) => e.key === 'Enter' && handleLogin()}
                        data-testid="input-franchisor-password"
                    />
                </div>

                <Button
                    size="lg"
                    className="w-full py-6 text-lg bg-gradient-to-r from-[#5B9FB5] to-[#7DD3E8] hover:from-[#4A8EA4] hover:to-[#6CC2D7] text-white"
                    onClick={handleLogin}
                    disabled={isLoggingIn}
                    data-testid="button-login-modal"
                >
                    <LogIn className="w-5 h-5 mr-2" />
                    {isLoggingIn ? "Autenticando..." : "Entrar"}
                </Button>
            </DialogContent>
        </Dialog>
    );
}
