import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle, ArrowLeft } from "lucide-react";
import { Link } from "wouter";
import { DelfosLogo } from "@/components/DelfosLogo";

interface SuccessViewProps {
    t: any;
    masterCode: string;
    onReset: () => void;
}

export function SuccessView({ t, masterCode, onReset }: SuccessViewProps) {
    return (
        <div className="min-h-screen bg-gradient-to-br from-blue-900 via-blue-800 to-indigo-900 flex items-center justify-center p-4">
            <Card className="w-full max-w-md bg-black/40 border-blue-500/30 backdrop-blur-sm">
                <CardHeader className="text-center">
                    <div className="flex justify-center mb-4">
                        <DelfosLogo />
                    </div>
                    <div className="flex justify-center mb-4">
                        <CheckCircle className="h-16 w-16 text-green-400" />
                    </div>
                    <CardTitle className="text-2xl text-blue-100">{t.success}</CardTitle>
                    <CardDescription className="text-blue-200/70">
                        {t.successMessage}
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="bg-blue-900/50 border border-blue-500/30 rounded-lg p-4 text-center">
                        <p className="text-blue-300 text-sm mb-1">Master Code</p>
                        <p className="text-2xl font-mono font-bold text-blue-100" data-testid="text-master-code">
                            {masterCode}
                        </p>
                    </div>
                    <p className="text-blue-200/70 text-sm text-center">
                        {t.successNote}
                    </p>
                    <div className="flex flex-col gap-2">
                        <Link href="/">
                            <Button className="w-full bg-blue-600 hover:bg-blue-500 text-white" data-testid="button-back-home">
                                {t.backToHome}
                            </Button>
                        </Link>
                        <Button
                            variant="outline"
                            className="w-full border-blue-500/30 text-blue-200 hover:bg-blue-900/30"
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
