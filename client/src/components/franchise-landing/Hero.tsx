import { DelfosLogo } from "@/components/DelfosLogo";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";

interface HeroProps {
    t: any;
}

export function Hero({ t }: HeroProps) {
    return (
        <>
            <header className="p-4 flex items-center justify-between">
                <Link href="/">
                    <DelfosLogo variant="full" className="h-10" />
                </Link>
                <div className="flex gap-2">
                    <Link href="/login/franchisor">
                        <Button variant="ghost" size="sm" data-testid="link-login-franchisor">
                            {t.loginFranchisor}
                        </Button>
                    </Link>
                    <Link href="/login/franchise">
                        <Button variant="outline" size="sm" data-testid="link-login-franchise">
                            {t.loginFranchise}
                        </Button>
                    </Link>
                </div>
            </header>

            <div className="text-center mb-8 max-w-4xl mx-auto px-4 pt-8">
                <h1 className="text-3xl md:text-4xl font-bold text-white mb-2">{t.title}</h1>
                <p className="text-slate-400">{t.subtitle}</p>
            </div>
        </>
    );
}
