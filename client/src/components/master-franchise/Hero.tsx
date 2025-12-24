import { DelfosLogo } from "@/components/DelfosLogo";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Globe, CheckCircle, Building2, ArrowLeft } from "lucide-react";
import { Link } from "wouter";

interface HeroProps {
    t: any;
}

export function Hero({ t }: HeroProps) {
    return (
        <div className="text-center mb-8">
            <div className="flex justify-center mb-8">
                <DelfosLogo />
            </div>

            <h1 className="text-3xl md:text-4xl font-bold text-blue-100 mb-2" data-testid="text-title">
                {t.title}
            </h1>
            <p className="text-blue-200/70 text-lg mb-8">
                {t.subtitle}
            </p>

            <div className="grid md:grid-cols-1 gap-8 max-w-2xl mx-auto mb-8">
                <Card className="bg-black/30 border-blue-500/20 backdrop-blur-sm text-left">
                    <CardHeader>
                        <CardTitle className="text-xl text-blue-100 flex items-center gap-2">
                            <Globe className="h-5 w-5 text-blue-400" />
                            Master Franchise Benefits
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-blue-200/70 mb-4">
                            {t.description}
                        </p>
                        <ul className="space-y-2">
                            {t.benefits.map((benefit: string, index: number) => (
                                <li key={index} className="flex items-center gap-2 text-blue-200">
                                    <CheckCircle className="h-4 w-4 text-green-400 flex-shrink-0" />
                                    {benefit}
                                </li>
                            ))}
                        </ul>
                    </CardContent>
                </Card>
            </div>

            <div className="flex justify-center gap-4">
                <Link href="/login/master_franchise">
                    <Button variant="outline" className="border-blue-500/30 text-blue-200 hover:bg-blue-900/30" data-testid="link-login-master">
                        <Building2 className="mr-2 h-4 w-4" />
                        {t.loginMaster}
                    </Button>
                </Link>
                <Link href="/">
                    <Button variant="ghost" className="text-blue-300 hover:text-blue-200" data-testid="link-back-home">
                        <ArrowLeft className="mr-2 h-4 w-4" />
                        {t.backToHome}
                    </Button>
                </Link>
            </div>
        </div>
    );
}
