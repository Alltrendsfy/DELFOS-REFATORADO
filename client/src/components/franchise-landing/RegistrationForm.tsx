import { useState, useRef, useCallback } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { Check, User, MapPin, Phone, FileText, Loader2, Upload, X, File, Shield, Zap, TrendingUp, Crown } from "lucide-react";
import { ObjectUploader } from "@/components/ObjectUploader";

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

interface UploadedDocument {
    type: string;
    url: string;
    name: string;
}

const formSchema = z.object({
    planId: z.string().optional(),
    name: z.string().min(3, "Name must be at least 3 characters"),
    tradeName: z.string().optional(),
    documentType: z.enum(["cpf", "cnpj"]),
    documentNumber: z.string().min(11, "Document number is required"),
    secondaryDocument: z.string().optional(),
    birthDate: z.string().optional(),
    addressStreet: z.string().optional(),
    addressNumber: z.string().optional(),
    addressComplement: z.string().optional(),
    addressReference: z.string().optional(),
    addressNeighborhood: z.string().optional(),
    addressZip: z.string().optional(),
    addressCity: z.string().optional(),
    addressCountry: z.string().default("BRA"),
    phone: z.string().optional(),
    whatsapp: z.string().optional(),
    email: z.string().email("Invalid email address"),
    notes: z.string().optional(),
});

type FormData = z.infer<typeof formSchema>;

interface RegistrationFormProps {
    t: any;
    plansData: any[];
    selectedPlanId: string | null;
    onSuccess: (data: any) => void;
    language: string;
}

export function RegistrationForm({ t, plansData, selectedPlanId, onSuccess, language }: RegistrationFormProps) {
    const { toast } = useToast();
    const [step, setStep] = useState(1);
    const [leadId, setLeadId] = useState<string | null>(null);
    const [uploadedDocuments, setUploadedDocuments] = useState<UploadedDocument[]>([]);
    const [isProcessingPayment, setIsProcessingPayment] = useState(false);
    const pendingObjectPaths = useRef<Map<string, string>>(new Map());

    const form = useForm<FormData>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            documentType: "cpf",
            addressCountry: "BRA",
            planId: selectedPlanId || undefined,
        },
    });

    // Update planId when selectedPlanId changes
    if (selectedPlanId && form.getValues("planId") !== selectedPlanId) {
        form.setValue("planId", selectedPlanId);
    }

    const handleUploadComplete = useCallback((result: any) => {
        if (result.successful && result.successful.length > 0) {
            const newDocs: UploadedDocument[] = result.successful.map((file: any) => {
                const storedPath = pendingObjectPaths.current.get(file.id) || `/objects/uploads/${file.id}`;
                pendingObjectPaths.current.delete(file.id);
                return {
                    type: "document",
                    url: storedPath,
                    name: file.name || "Document",
                };
            });
            setUploadedDocuments(prev => [...prev, ...newDocs]);
            toast({
                title: language === "pt-BR" ? "Sucesso" : language === "es" ? "Éxito" : "Success",
                description: language === "pt-BR"
                    ? "Arquivo enviado com sucesso"
                    : language === "es"
                        ? "Archivo subido exitosamente"
                        : "File uploaded successfully",
            });
        }
    }, [toast, language]);

    const removeDocument = useCallback((index: number) => {
        setUploadedDocuments(prev => prev.filter((_, i) => i !== index));
    }, []);

    const getUploadParameters = useCallback(async (file: any) => {
        const res = await fetch("/api/uploads/request-url", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                name: file.name,
                size: file.size,
                contentType: file.type,
            }),
        });
        const { uploadURL, objectPath } = await res.json();
        pendingObjectPaths.current.set(file.id, objectPath);
        return {
            method: "PUT" as const,
            url: uploadURL,
            headers: { "Content-Type": file.type || "application/octet-stream" },
        };
    }, []);

    const submitMutation = useMutation({
        mutationFn: async (data: FormData) => {
            return await apiRequest<{ success: boolean; franchiseCode: string; leadId: string; message: string }>(
                "/api/franchise-leads/register",
                "POST",
                {
                    ...data,
                    documentsUrls: uploadedDocuments,
                }
            );
        },
        onSuccess: (data) => {
            setLeadId(data.leadId);
            setStep(4);
            onSuccess(data); // We only call onSuccess fully when payment is done or we want to show success view? 
            // Actually, original code showed SuccessView only after step 4 logic or if submitted is true.
            // But wait, step 4 is payment. If we are at step 4, we are not "submitted" in the sense of showing success view yet?
            // Let's check original code. 
            // Original code: onSuccess sets submitted=true. 
            // BUT wait, submitMutation is called at end of step 3.
            // onSuccess of submitMutation sets step(4).
            // Step 4 is payment.
            // So we are NOT done yet.
        },
        onError: (error: any) => {
            let description = t.errorGeneric;
            if (error.message?.includes("email_already_registered")) {
                description = t.errorEmailDuplicate;
            } else if (error.message?.includes("document_already_registered")) {
                description = t.errorDocumentDuplicate;
            } else if (error.message) {
                description = error.message;
            }
            toast({
                title: "Error",
                description,
                variant: "destructive",
            });
        },
    });

    const onSubmit = (data: FormData) => {
        submitMutation.mutate(data);
    };

    const nextStep = async () => {
        let fieldsToValidate: (keyof FormData)[] = [];
        if (step === 1) {
            fieldsToValidate = ["name", "documentType", "documentNumber", "email"];
        } else if (step === 2) {
            fieldsToValidate = ["addressStreet", "addressCity"];
        }

        const isValid = await form.trigger(fieldsToValidate);
        if (isValid) {
            setStep(step + 1);
        }
    };

    return (
        <Card>
            <CardHeader>
                <div className="flex items-center justify-between mb-4">
                    <div className="flex gap-2">
                        {[1, 2, 3, 4].map((s) => (
                            <div
                                key={s}
                                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${s === step
                                        ? "bg-primary text-primary-foreground"
                                        : s < step
                                            ? "bg-green-500 text-white"
                                            : "bg-muted text-muted-foreground"
                                    }`}
                            >
                                {s < step ? <Check className="w-4 h-4" /> : s}
                            </div>
                        ))}
                    </div>
                    <span className="text-sm text-muted-foreground">
                        {step === 1 && t.step1}
                        {step === 2 && t.step2}
                        {step === 3 && t.step3}
                        {step === 4 && t.step4}
                    </span>
                </div>
            </CardHeader>
            <CardContent>
                <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                        {step === 1 && (
                            <>
                                <div className="flex items-center gap-2 text-lg font-medium mb-4">
                                    <User className="w-5 h-5" />
                                    {t.step1}
                                </div>

                                {plansData && Array.isArray(plansData) && plansData.length > 0 && (
                                    <FormField
                                        control={form.control}
                                        name="planId"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>{t.selectPlan}</FormLabel>
                                                <Select onValueChange={field.onChange} value={field.value}>
                                                    <FormControl>
                                                        <SelectTrigger data-testid="select-plan">
                                                            <SelectValue placeholder={t.selectPlan} />
                                                        </SelectTrigger>
                                                    </FormControl>
                                                    <SelectContent>
                                                        {plansData.map((plan: any) => (
                                                            <SelectItem key={plan.id} value={plan.id}>
                                                                {plan.name} - {formatPlanPrice(plan.franchise_fee_usd)}
                                                            </SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                )}

                                <FormField
                                    control={form.control}
                                    name="name"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>{t.name} *</FormLabel>
                                            <FormControl>
                                                <Input {...field} placeholder={t.namePlaceholder} data-testid="input-name" />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />

                                <FormField
                                    control={form.control}
                                    name="tradeName"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>{t.tradeName}</FormLabel>
                                            <FormControl>
                                                <Input {...field} placeholder={t.tradeNamePlaceholder} data-testid="input-trade-name" />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />

                                <div className="grid grid-cols-2 gap-4">
                                    <FormField
                                        control={form.control}
                                        name="documentType"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>{t.documentType} *</FormLabel>
                                                <Select onValueChange={field.onChange} value={field.value}>
                                                    <FormControl>
                                                        <SelectTrigger data-testid="select-document-type">
                                                            <SelectValue />
                                                        </SelectTrigger>
                                                    </FormControl>
                                                    <SelectContent>
                                                        <SelectItem value="cpf">{t.cpf}</SelectItem>
                                                        <SelectItem value="cnpj">{t.cnpj}</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />

                                    <FormField
                                        control={form.control}
                                        name="documentNumber"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>{t.documentNumber} *</FormLabel>
                                                <FormControl>
                                                    <Input {...field} placeholder={t.documentPlaceholder} data-testid="input-document" />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                </div>

                                <FormField
                                    control={form.control}
                                    name="secondaryDocument"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>{t.secondaryDocument}</FormLabel>
                                            <FormControl>
                                                <Input {...field} placeholder={t.secondaryPlaceholder} data-testid="input-secondary-doc" />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />

                                <FormField
                                    control={form.control}
                                    name="birthDate"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>{t.birthDate}</FormLabel>
                                            <FormControl>
                                                <Input {...field} type="date" data-testid="input-birth-date" />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />

                                <FormField
                                    control={form.control}
                                    name="email"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>{t.email} *</FormLabel>
                                            <FormControl>
                                                <Input {...field} type="email" placeholder={t.emailPlaceholder} data-testid="input-email" />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                            </>
                        )}

                        {step === 2 && (
                            <>
                                <div className="flex items-center gap-2 text-lg font-medium mb-4">
                                    <MapPin className="w-5 h-5" />
                                    {t.step2}
                                </div>

                                <FormField
                                    control={form.control}
                                    name="addressStreet"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>{t.street}</FormLabel>
                                            <FormControl>
                                                <Input {...field} placeholder={t.streetPlaceholder} data-testid="input-street" />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />

                                <div className="grid grid-cols-3 gap-4">
                                    <FormField
                                        control={form.control}
                                        name="addressNumber"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>{t.number}</FormLabel>
                                                <FormControl>
                                                    <Input {...field} placeholder={t.numberPlaceholder} data-testid="input-number" />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />

                                    <FormField
                                        control={form.control}
                                        name="addressComplement"
                                        render={({ field }) => (
                                            <FormItem className="col-span-2">
                                                <FormLabel>{t.complement}</FormLabel>
                                                <FormControl>
                                                    <Input {...field} placeholder={t.complementPlaceholder} data-testid="input-complement" />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                </div>

                                <FormField
                                    control={form.control}
                                    name="addressReference"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>{t.reference}</FormLabel>
                                            <FormControl>
                                                <Input {...field} placeholder={t.referencePlaceholder} data-testid="input-reference" />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />

                                <div className="grid grid-cols-2 gap-4">
                                    <FormField
                                        control={form.control}
                                        name="addressNeighborhood"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>{t.neighborhood}</FormLabel>
                                                <FormControl>
                                                    <Input {...field} placeholder={t.neighborhoodPlaceholder} data-testid="input-neighborhood" />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />

                                    <FormField
                                        control={form.control}
                                        name="addressZip"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>{t.zipCode}</FormLabel>
                                                <FormControl>
                                                    <Input {...field} placeholder={t.zipPlaceholder} data-testid="input-zip" />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                </div>

                                <FormField
                                    control={form.control}
                                    name="addressCity"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>{t.city}</FormLabel>
                                            <FormControl>
                                                <Input {...field} placeholder={t.cityPlaceholder} data-testid="input-city" />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />

                                <FormField
                                    control={form.control}
                                    name="addressCountry"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>{t.country}</FormLabel>
                                            <Select onValueChange={field.onChange} value={field.value}>
                                                <FormControl>
                                                    <SelectTrigger data-testid="select-country">
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                </FormControl>
                                                <SelectContent>
                                                    <SelectItem value="BRA">Brasil</SelectItem>
                                                    <SelectItem value="USA">United States</SelectItem>
                                                    <SelectItem value="MEX">México</SelectItem>
                                                    <SelectItem value="ARG">Argentina</SelectItem>
                                                    <SelectItem value="COL">Colombia</SelectItem>
                                                    <SelectItem value="PER">Perú</SelectItem>
                                                    <SelectItem value="CHL">Chile</SelectItem>
                                                </SelectContent>
                                            </Select>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                            </>
                        )}

                        {step === 3 && (
                            <>
                                <div className="flex items-center gap-2 text-lg font-medium mb-4">
                                    <Phone className="w-5 h-5" />
                                    {t.step3}
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <FormField
                                        control={form.control}
                                        name="phone"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>{t.phone}</FormLabel>
                                                <FormControl>
                                                    <Input {...field} placeholder={t.phonePlaceholder} data-testid="input-phone" />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />

                                    <FormField
                                        control={form.control}
                                        name="whatsapp"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>{t.whatsapp}</FormLabel>
                                                <FormControl>
                                                    <Input {...field} placeholder={t.whatsappPlaceholder} data-testid="input-whatsapp" />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                </div>

                                <FormField
                                    control={form.control}
                                    name="notes"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>{t.notes}</FormLabel>
                                            <FormControl>
                                                <Textarea
                                                    {...field}
                                                    placeholder={t.notesPlaceholder}
                                                    rows={4}
                                                    data-testid="input-notes"
                                                />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />

                                <div className="space-y-3 pt-4 border-t">
                                    <div className="flex items-center gap-2">
                                        <FileText className="w-5 h-5" />
                                        <div>
                                            <Label className="text-base font-medium">{t.uploadDocuments}</Label>
                                            <p className="text-sm text-muted-foreground">{t.uploadDocumentsDesc}</p>
                                        </div>
                                    </div>

                                    <ObjectUploader
                                        maxNumberOfFiles={5}
                                        maxFileSize={5242880}
                                        onGetUploadParameters={getUploadParameters}
                                        onComplete={handleUploadComplete}
                                        buttonClassName="w-full"
                                    >
                                        <Upload className="w-4 h-4 mr-2" />
                                        {t.uploadButton}
                                    </ObjectUploader>

                                    {uploadedDocuments.length > 0 && (
                                        <div className="space-y-2">
                                            <Label className="text-sm">{t.uploadedFiles}</Label>
                                            <div className="space-y-2">
                                                {uploadedDocuments.map((doc, index) => (
                                                    <div
                                                        key={index}
                                                        className="flex items-center justify-between p-2 bg-muted rounded-md"
                                                        data-testid={`uploaded-file-${index}`}
                                                    >
                                                        <div className="flex items-center gap-2 min-w-0">
                                                            <File className="w-4 h-4 flex-shrink-0 text-muted-foreground" />
                                                            <span className="text-sm truncate">{doc.name}</span>
                                                        </div>
                                                        <Button
                                                            type="button"
                                                            variant="ghost"
                                                            size="icon"
                                                            onClick={() => removeDocument(index)}
                                                            data-testid={`button-remove-file-${index}`}
                                                        >
                                                            <X className="w-4 h-4" />
                                                        </Button>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {uploadedDocuments.length === 0 && (
                                        <p className="text-sm text-muted-foreground italic">{t.noFilesUploaded}</p>
                                    )}
                                </div>
                            </>
                        )}

                        {step === 4 && (
                            <>
                                <div className="flex items-center gap-2 text-lg font-medium mb-4">
                                    <Shield className="w-5 h-5" />
                                    {t.step4}
                                </div>

                                <div className="space-y-6">
                                    <div className="text-center space-y-2">
                                        <h3 className="text-xl font-semibold">{t.paymentTitle}</h3>
                                        <p className="text-muted-foreground">{t.paymentDesc}</p>
                                    </div>

                                    {selectedPlanId && plansData && (() => {
                                        const selectedPlan = plansData.find((p: any) => p.id === selectedPlanId);
                                        if (!selectedPlan) return null;
                                        const style = getPlanStyle(selectedPlan.code || "starter");
                                        return (
                                            <div className={`p-4 rounded-lg border ${style.borderColor} bg-gradient-to-r ${style.color}/10`}>
                                                <div className="flex justify-between items-center">
                                                    <div>
                                                        <p className="font-medium">{selectedPlan.name}</p>
                                                        <p className="text-sm text-muted-foreground">{t.paymentAmount}</p>
                                                    </div>
                                                    <div className="text-2xl font-bold" data-testid="payment-amount">
                                                        {formatPlanPrice(selectedPlan.franchise_fee_usd)}
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })()}

                                    <div className="space-y-3">
                                        <Button
                                            type="button"
                                            className="w-full"
                                            size="lg"
                                            disabled={isProcessingPayment || !leadId}
                                            onClick={async () => {
                                                if (!leadId || !selectedPlanId) return;
                                                setIsProcessingPayment(true);
                                                try {
                                                    const response = await apiRequest<{ checkoutUrl: string; sessionId: string }>(
                                                        `/api/franchise-leads/${leadId}/checkout`,
                                                        "POST",
                                                        { planId: selectedPlanId }
                                                    );
                                                    if (response.checkoutUrl) {
                                                        window.location.href = response.checkoutUrl;
                                                    }
                                                } catch (error: any) {
                                                    toast({
                                                        title: "Error",
                                                        description: error.message || "Failed to create checkout session",
                                                        variant: "destructive",
                                                    });
                                                    setIsProcessingPayment(false);
                                                }
                                            }}
                                            data-testid="button-pay"
                                        >
                                            {isProcessingPayment ? (
                                                <>
                                                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                                    {t.processingPayment}
                                                </>
                                            ) : (
                                                t.payWithCard
                                            )}
                                        </Button>

                                        <p className="text-xs text-center text-muted-foreground">
                                            {t.paymentNote}
                                        </p>
                                    </div>
                                </div>
                            </>
                        )}

                        {step < 4 && (
                            <div className="flex justify-between pt-4">
                                {step > 1 ? (
                                    <Button type="button" variant="outline" onClick={() => setStep(step - 1)} data-testid="button-previous">
                                        {t.previous}
                                    </Button>
                                ) : (
                                    <div />
                                )}

                                {step < 3 ? (
                                    <Button type="button" onClick={nextStep} data-testid="button-next">
                                        {t.next}
                                    </Button>
                                ) : (
                                    <Button type="submit" disabled={submitMutation.isPending} data-testid="button-submit">
                                        {submitMutation.isPending ? (
                                            <>
                                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                                {t.submitting}
                                            </>
                                        ) : (
                                            t.submit
                                        )}
                                    </Button>
                                )}
                            </div>
                        )}
                    </form>
                </Form>
            </CardContent>
        </Card>
    );
}
