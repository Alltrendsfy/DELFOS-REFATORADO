import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { LogIn, Crown, Building2, TrendingUp } from "lucide-react";

interface AccessPortalProps {
    content: any;
}

export function AccessPortal({ content }: AccessPortalProps) {
    return (
        <section className="py-16 bg-gradient-to-b from-slate-900/50 via-slate-800/80 to-slate-900/50 border-y border-slate-700/50">
            <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="text-center mb-10">
                    <div className="inline-flex items-center justify-center gap-2 bg-slate-700/50 rounded-full px-4 py-2 mb-4">
                        <LogIn className="w-5 h-5 text-cyan-400" />
                        <span className="text-sm font-medium text-cyan-400">{content.title}</span>
                    </div>
                    <h2 className="text-3xl md:text-4xl font-bold text-white mb-3">{content.title}</h2>
                    <p className="text-lg text-slate-300">{content.subtitle}</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {/* Franchisor Access Card - Amber/Gold */}
                    <a href="/login/franchisor">
                        <Card
                            className="relative overflow-visible border-2 border-amber-500/50 bg-slate-800/50 backdrop-blur cursor-pointer transition-all hover-elevate h-full"
                            data-testid="card-access-franchisor"
                        >
                            <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-amber-500 to-yellow-600" />
                            <div className="p-6 text-center">
                                <div className="w-14 h-14 mx-auto rounded-full bg-gradient-to-r from-amber-500 to-yellow-600 flex items-center justify-center mb-4">
                                    <Crown className="w-7 h-7 text-white" />
                                </div>
                                <h3 className="text-xl font-semibold text-white mb-2">{content.franchisor}</h3>
                                <p className="text-sm text-slate-300 mb-4">{content.franchisorDesc}</p>
                                <Button
                                    className="w-full bg-gradient-to-r from-amber-500 to-yellow-600"
                                    data-testid="button-access-franchisor"
                                >
                                    {content.accessButton}
                                </Button>
                            </div>
                        </Card>
                    </a>

                    {/* Master Franchise Access Card - Blue */}
                    <a href="/login/master">
                        <Card
                            className="relative overflow-visible border-2 border-blue-500/50 bg-slate-800/50 backdrop-blur cursor-pointer transition-all hover-elevate h-full"
                            data-testid="card-access-master"
                        >
                            <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-blue-500 to-indigo-600" />
                            <div className="p-6 text-center">
                                <div className="w-14 h-14 mx-auto rounded-full bg-gradient-to-r from-blue-500 to-indigo-600 flex items-center justify-center mb-4">
                                    <Building2 className="w-7 h-7 text-white" />
                                </div>
                                <h3 className="text-xl font-semibold text-white mb-2">{content.master}</h3>
                                <p className="text-sm text-slate-300 mb-4">{content.masterDesc}</p>
                                <Button
                                    className="w-full bg-gradient-to-r from-blue-500 to-indigo-600"
                                    data-testid="button-access-master"
                                >
                                    {content.accessButton}
                                </Button>
                            </div>
                        </Card>
                    </a>

                    {/* Franchise Access Card - Cyan */}
                    <a href="/login/franchise">
                        <Card
                            className="relative overflow-visible border-2 border-cyan-500/50 bg-slate-800/50 backdrop-blur cursor-pointer transition-all hover-elevate h-full"
                            data-testid="card-access-franchise"
                        >
                            <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-cyan-500 to-teal-600" />
                            <div className="p-6 text-center">
                                <div className="w-14 h-14 mx-auto rounded-full bg-gradient-to-r from-cyan-500 to-teal-600 flex items-center justify-center mb-4">
                                    <TrendingUp className="w-7 h-7 text-white" />
                                </div>
                                <h3 className="text-xl font-semibold text-white mb-2">{content.franchise}</h3>
                                <p className="text-sm text-slate-300 mb-4">{content.franchiseDesc}</p>
                                <Button
                                    className="w-full bg-gradient-to-r from-cyan-500 to-teal-600"
                                    data-testid="button-access-franchise"
                                >
                                    {content.accessButton}
                                </Button>
                            </div>
                        </Card>
                    </a>
                </div>
            </div>
        </section>
    );
}
