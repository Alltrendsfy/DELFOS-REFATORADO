import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, Shield, Bot, BarChart3, Zap, TrendingUp, Crown, Loader2 } from "lucide-react";

// Plan visual styling
const PLAN_STYLES = {
    starter: {
        icon: Zap,
        color: "from-cyan-500 to-blue-600",
        borderColor: "border-cyan-500/50",
        checkColor: "text-cyan-400",
    },
    pro: {
        icon: TrendingUp,
        color: "from-violet-500 to-purple-600",
        borderColor: "border-violet-500/50",
        checkColor: "text-violet-400",
        popular: true,
    },
    enterprise: {
        icon: Crown,
        color: "from-amber-500 to-orange-600",
        borderColor: "border-amber-500/50",
        checkColor: "text-amber-400",
        premium: true,
    },
};

// Helper to format price from USD to BRL display
const formatPlanPrice = (priceUsd: string | null | undefined): string => {
    if (!priceUsd) return "R$ 0";
    const num = parseFloat(priceUsd);
    return num.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 0, maximumFractionDigits: 0 });
};

// Helper to get plan style by code
const getPlanStyle = (code: string) => {
    const normalizedCode = code?.toLowerCase() || "starter";
    if (normalizedCode === "starter") return PLAN_STYLES.starter;
    if (normalizedCode === "pro" || normalizedCode === "professional") return PLAN_STYLES.pro;
    if (normalizedCode === "enterprise") return PLAN_STYLES.enterprise;
    return PLAN_STYLES.starter;
};

interface PlansProps {
    t: any;
    plansData: any[];
    plansLoading: boolean;
    onSelectPlan: (planId: string) => void;
}

export function Plans({ t, plansData, plansLoading, onSelectPlan }: PlansProps) {
    const getPlanByCode = (code: string) => {
        if (!plansData) return null;
        return plansData.find(p => p.code?.toLowerCase() === code.toLowerCase());
    };

    return (
        <section className="mb-12 max-w-6xl mx-auto">
            <div className="text-center mb-8">
                <h2 className="text-2xl md:text-3xl font-bold text-white mb-2">{t.plansTitle}</h2>
                <p className="text-slate-400">{t.plansSubtitle}</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {plansLoading ? (
                    <div className="col-span-3 flex justify-center py-12">
                        <Loader2 className="w-8 h-8 animate-spin text-cyan-400" />
                    </div>
                ) : (
                    <>
                        {/* Starter Plan */}
                        {(() => {
                            const plan = getPlanByCode("starter");
                            const style = PLAN_STYLES.starter;
                            const IconComponent = style.icon;
                            return (
                                <Card
                                    className={`relative overflow-visible border-2 ${style.borderColor} bg-slate-800/50 backdrop-blur cursor-pointer transition-all ${plan ? 'hover-elevate' : 'opacity-50'}`}
                                    onClick={() => plan && onSelectPlan(plan.id)}
                                    data-testid="card-plan-starter"
                                >
                                    <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${style.color}`} />
                                    <CardHeader className="text-center pb-2">
                                        <div className={`w-14 h-14 mx-auto rounded-full bg-gradient-to-r ${style.color} flex items-center justify-center mb-3`}>
                                            <IconComponent className="w-7 h-7 text-white" />
                                        </div>
                                        <CardTitle className="text-xl text-white">{t.starterName}</CardTitle>
                                        <CardDescription className="text-cyan-400">{t.starterTagline}</CardDescription>
                                    </CardHeader>
                                    <CardContent className="text-center">
                                        <div className="mb-4">
                                            <span className="text-3xl font-bold text-white" data-testid="price-starter">
                                                {formatPlanPrice(plan?.franchise_fee_usd)}
                                            </span>
                                        </div>
                                        <p className="text-sm text-slate-300 mb-4">{t.starterDesc}</p>
                                        <ul className="space-y-2 text-left mb-6">
                                            <li className="flex items-center gap-2 text-sm text-slate-300">
                                                <Check className={`w-4 h-4 ${style.checkColor} shrink-0`} />
                                                {t.starterFeature1}
                                            </li>
                                            <li className="flex items-center gap-2 text-sm text-slate-300">
                                                <Check className={`w-4 h-4 ${style.checkColor} shrink-0`} />
                                                {t.starterFeature2}
                                            </li>
                                            <li className="flex items-center gap-2 text-sm text-slate-300">
                                                <Check className={`w-4 h-4 ${style.checkColor} shrink-0`} />
                                                {t.starterFeature3}
                                            </li>
                                            <li className="flex items-center gap-2 text-sm text-slate-300">
                                                <Check className={`w-4 h-4 ${style.checkColor} shrink-0`} />
                                                {t.starterFeature4}
                                            </li>
                                            <li className="flex items-center gap-2 text-sm text-slate-300">
                                                <Shield className={`w-4 h-4 ${style.checkColor} shrink-0`} />
                                                {t.starterFeature5}
                                            </li>
                                            <li className="flex items-center gap-2 text-sm text-slate-300">
                                                <BarChart3 className={`w-4 h-4 ${style.checkColor} shrink-0`} />
                                                {t.starterFeature6}
                                            </li>
                                        </ul>
                                        <Button
                                            className={`w-full bg-gradient-to-r ${style.color} hover:opacity-90`}
                                            data-testid="button-select-starter"
                                            disabled={!plan}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                if (plan) onSelectPlan(plan.id);
                                            }}
                                        >
                                            {t.chooseThisPlan}
                                        </Button>
                                    </CardContent>
                                </Card>
                            );
                        })()}

                        {/* Professional Plan */}
                        {(() => {
                            const plan = getPlanByCode("pro");
                            const style = PLAN_STYLES.pro;
                            const IconComponent = style.icon;
                            return (
                                <Card
                                    className={`relative overflow-visible border-2 ${style.borderColor} bg-slate-800/50 backdrop-blur cursor-pointer transition-all scale-105 shadow-xl shadow-violet-500/20 ${plan ? 'hover-elevate' : 'opacity-50'}`}
                                    onClick={() => plan && onSelectPlan(plan.id)}
                                    data-testid="card-plan-professional"
                                >
                                    <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 bg-gradient-to-r from-violet-500 to-purple-600 text-white border-0">
                                        {t.mostPopular}
                                    </Badge>
                                    <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${style.color}`} />
                                    <CardHeader className="text-center pb-2">
                                        <div className={`w-14 h-14 mx-auto rounded-full bg-gradient-to-r ${style.color} flex items-center justify-center mb-3`}>
                                            <IconComponent className="w-7 h-7 text-white" />
                                        </div>
                                        <CardTitle className="text-xl text-white">{t.proName}</CardTitle>
                                        <CardDescription className="text-violet-400">{t.proTagline}</CardDescription>
                                    </CardHeader>
                                    <CardContent className="text-center">
                                        <div className="mb-4">
                                            <span className="text-3xl font-bold text-white" data-testid="price-professional">
                                                {formatPlanPrice(plan?.franchise_fee_usd)}
                                            </span>
                                        </div>
                                        <p className="text-sm text-slate-300 mb-4">{t.proDesc}</p>
                                        <ul className="space-y-2 text-left mb-6">
                                            <li className="flex items-center gap-2 text-sm text-slate-300">
                                                <Check className={`w-4 h-4 ${style.checkColor} shrink-0`} />
                                                {t.proFeature1}
                                            </li>
                                            <li className="flex items-center gap-2 text-sm text-slate-300">
                                                <Check className={`w-4 h-4 ${style.checkColor} shrink-0`} />
                                                {t.proFeature2}
                                            </li>
                                            <li className="flex items-center gap-2 text-sm text-slate-300">
                                                <Check className={`w-4 h-4 ${style.checkColor} shrink-0`} />
                                                {t.proFeature3}
                                            </li>
                                            <li className="flex items-center gap-2 text-sm text-slate-300">
                                                <Bot className={`w-4 h-4 ${style.checkColor} shrink-0`} />
                                                {t.proFeature4}
                                            </li>
                                            <li className="flex items-center gap-2 text-sm text-slate-300">
                                                <Shield className={`w-4 h-4 ${style.checkColor} shrink-0`} />
                                                {t.proFeature5}
                                            </li>
                                            <li className="flex items-center gap-2 text-sm text-slate-300">
                                                <BarChart3 className={`w-4 h-4 ${style.checkColor} shrink-0`} />
                                                {t.proFeature6}
                                            </li>
                                        </ul>
                                        <Button
                                            className={`w-full bg-gradient-to-r ${style.color} hover:opacity-90`}
                                            data-testid="button-select-professional"
                                            disabled={!plan}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                if (plan) onSelectPlan(plan.id);
                                            }}
                                        >
                                            {t.chooseThisPlan}
                                        </Button>
                                    </CardContent>
                                </Card>
                            );
                        })()}

                        {/* Enterprise Plan */}
                        {(() => {
                            const plan = getPlanByCode("enterprise");
                            const style = PLAN_STYLES.enterprise;
                            const IconComponent = style.icon;
                            return (
                                <Card
                                    className={`relative overflow-visible border-2 ${style.borderColor} bg-slate-800/50 backdrop-blur cursor-pointer transition-all ${plan ? 'hover-elevate' : 'opacity-50'}`}
                                    onClick={() => plan && onSelectPlan(plan.id)}
                                    data-testid="card-plan-enterprise"
                                >
                                    <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 bg-gradient-to-r from-amber-500 to-orange-600 text-white border-0">
                                        {t.premium}
                                    </Badge>
                                    <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${style.color}`} />
                                    <CardHeader className="text-center pb-2">
                                        <div className={`w-14 h-14 mx-auto rounded-full bg-gradient-to-r ${style.color} flex items-center justify-center mb-3`}>
                                            <IconComponent className="w-7 h-7 text-white" />
                                        </div>
                                        <CardTitle className="text-xl text-white">{t.enterpriseName}</CardTitle>
                                        <CardDescription className="text-amber-400">{t.enterpriseTagline}</CardDescription>
                                    </CardHeader>
                                    <CardContent className="text-center">
                                        <div className="mb-4">
                                            <span className="text-3xl font-bold text-white" data-testid="price-enterprise">
                                                {formatPlanPrice(plan?.franchise_fee_usd)}
                                            </span>
                                        </div>
                                        <p className="text-sm text-slate-300 mb-4">{t.enterpriseDesc}</p>
                                        <ul className="space-y-2 text-left mb-6">
                                            <li className="flex items-center gap-2 text-sm text-slate-300">
                                                <Check className={`w-4 h-4 ${style.checkColor} shrink-0`} />
                                                {t.enterpriseFeature1}
                                            </li>
                                            <li className="flex items-center gap-2 text-sm text-slate-300">
                                                <Check className={`w-4 h-4 ${style.checkColor} shrink-0`} />
                                                {t.enterpriseFeature2}
                                            </li>
                                            <li className="flex items-center gap-2 text-sm text-slate-300">
                                                <Check className={`w-4 h-4 ${style.checkColor} shrink-0`} />
                                                {t.enterpriseFeature3}
                                            </li>
                                            <li className="flex items-center gap-2 text-sm text-slate-300">
                                                <Bot className={`w-4 h-4 ${style.checkColor} shrink-0`} />
                                                {t.enterpriseFeature4}
                                            </li>
                                            <li className="flex items-center gap-2 text-sm text-slate-300">
                                                <Shield className={`w-4 h-4 ${style.checkColor} shrink-0`} />
                                                {t.enterpriseFeature5}
                                            </li>
                                            <li className="flex items-center gap-2 text-sm text-slate-300">
                                                <BarChart3 className={`w-4 h-4 ${style.checkColor} shrink-0`} />
                                                {t.enterpriseFeature6}
                                            </li>
                                        </ul>
                                        <Button
                                            className={`w-full bg-gradient-to-r ${style.color} hover:opacity-90`}
                                            data-testid="button-select-enterprise"
                                            disabled={!plan}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                if (plan) onSelectPlan(plan.id);
                                            }}
                                        >
                                            {t.chooseThisPlan}
                                        </Button>
                                    </CardContent>
                                </Card>
                            );
                        })()}
                    </>
                )}
            </div>
        </section>
    );
}
