import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { CheckCircle, ArrowLeft } from "lucide-react";

interface SuccessViewProps {
    t: any;
    franchiseCode: string;
    onReset: () => void;
}

export function SuccessView({ t, franchiseCode, onReset }: SuccessViewProps) {
    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
            <Card className="w-full max-w-md text-center">
                <CardHeader>
                    <div className="mx-auto mb-4">
                        <CheckCircle className="w-16 h-16 text-green-500" />
                    </div>
                    <CardTitle className="text-2xl">{t.success}</CardTitle>
                    <CardDescription className="text-base">{t.successMessage}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="bg-primary/10 rounded-lg p-4">
                        <code className="text-2xl font-bold text-primary" data-testid="text-franchise-code">
                            {franchiseCode}
                        </code>
                    </div>
                    <p className="text-sm text-muted-foreground">{t.successNote}</p>
                    <div className="flex flex-col gap-2">
                        <Link href="/">
                            <Button variant="outline" className="w-full" data-testid="button-back-home">
                                <ArrowLeft className="w-4 h-4 mr-2" />
                                {t.backToHome}
                            </Button>
                        </Link>
                        <Button
                            variant="ghost"
                            onClick={onReset}
                            data-testid="button-new-application"
                        >
                            {t.startNew}
                        </Button>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
