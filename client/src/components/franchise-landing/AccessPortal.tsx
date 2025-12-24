import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { LogIn, Crown, Building2, TrendingUp } from "lucide-react";

interface AccessPortalProps {
    t: any;
}

export function AccessPortal({ t }: AccessPortalProps) {
    return (
        <section className="py-16 -mx-4 px-4 md:-mx-8 md:px-8 bg-gradient-to-b from-slate-900/50 via-slate-800/80 to-slate-900/50 border-y border-slate-700/50 mb-12">
            <div className="max-w-4xl mx-auto">
                <div className="text-center mb-10">
                    <div className="inline-flex items-center justify-center gap-2 bg-slate-700/50 rounded-full px-4 py-2 mb-4">
                        <LogIn className="w-5 h-5 text-cyan-400" />
                        <span className="text-sm font-medium text-cyan-400">{t.accessPortalTitle}</span>
                    </div>
                    <h2 className="text-3xl md:text-4xl font-bold text-white mb-3">{t.accessPortalTitle}</h2>
                    <p className="text-lg text-slate-300">{t.accessPortalSubtitle}</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {/* Franchisor Access Card - Amber/Gold */}
                    <Link href="/login/franchisor">
                        <Card
                            className="relative overflow-visible border-2 border-amber-500/50 bg-slate-800/50 backdrop-blur cursor-pointer transition-all hover-elevate"
                            data-testid="card-access-franchisor"
                        >
                            <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-amber-500 to-yellow-600" />
                            <CardHeader className="text-center pb-2">
                                <div className="w-14 h-14 mx-auto rounded-full bg-gradient-to-r from-amber-500 to-yellow-600 flex items-center justify-center mb-3">
                                    <Crown className="w-7 h-7 text-white" />
                                </div>
                                <CardTitle className="text-xl text-white">{t.franchisorAccess}</CardTitle>
                            </CardHeader>
                            <CardContent className="text-center">
                                <p className="text-sm text-slate-300 mb-4">{t.franchisorAccessDesc}</p>
                                <Button
                                    className="w-full bg-gradient-to-r from-amber-500 to-yellow-600"
                                    data-testid="button-access-franchisor"
                                >
                                    {t.accessButton}
                                </Button>
                            </CardContent>
                        </Card>
                    </Link>

                    {/* Master Franchise Access Card - Blue */}
                    <Link href="/login/master">
                        <Card
                            className="relative overflow-visible border-2 border-blue-500/50 bg-slate-800/50 backdrop-blur cursor-pointer transition-all hover-elevate"
                            data-testid="card-access-master"
                        >
                            <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-blue-500 to-indigo-600" />
                            <CardHeader className="text-center pb-2">
                                <div className="w-14 h-14 mx-auto rounded-full bg-gradient-to-r from-blue-500 to-indigo-600 flex items-center justify-center mb-3">
                                    <Building2 className="w-7 h-7 text-white" />
                                </div>
                                <CardTitle className="text-xl text-white">{t.masterAccess}</CardTitle>
                            </CardHeader>
                            <CardContent className="text-center">
                                <p className="text-sm text-slate-300 mb-4">{t.masterAccessDesc}</p>
                                <Button
                                    className="w-full bg-gradient-to-r from-blue-500 to-indigo-600"
                                    data-testid="button-access-master"
                                >
                                    {t.accessButton}
                                </Button>
                            </CardContent>
                        </Card>
                    </Link>

                    {/* Franchise Access Card - Cyan */}
                    <Link href="/login/franchise">
                        <Card
                            className="relative overflow-visible border-2 border-cyan-500/50 bg-slate-800/50 backdrop-blur cursor-pointer transition-all hover-elevate"
                            data-testid="card-access-franchise"
                        >
                            <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-cyan-500 to-teal-600" />
                            <CardHeader className="text-center pb-2">
                                <div className="w-14 h-14 mx-auto rounded-full bg-gradient-to-r from-cyan-500 to-teal-600 flex items-center justify-center mb-3">
                                    <TrendingUp className="w-7 h-7 text-white" />
                                </div>
                                <CardTitle className="text-xl text-white">{t.franchiseAccess}</CardTitle>
                            </CardHeader>
                            <CardContent className="text-center">
                                <p className="text-sm text-slate-300 mb-4">{t.franchiseAccessDesc}</p>
                                <Button
                                    className="w-full bg-gradient-to-r from-cyan-500 to-teal-600"
                                    data-testid="button-access-franchise"
                                >
                                    {t.accessButton}
                                </Button>
                            </CardContent>
                        </Card>
                    </Link>
                </div>
            </div>
        </section>
    );
}
