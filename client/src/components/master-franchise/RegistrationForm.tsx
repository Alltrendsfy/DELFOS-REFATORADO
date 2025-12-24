import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { User, MapPin, Loader2 } from "lucide-react";

const countries = [
    { code: "BRA", name: "Brasil" },
    { code: "USA", name: "United States" },
    { code: "ESP", name: "España" },
    { code: "PRT", name: "Portugal" },
    { code: "MEX", name: "México" },
    { code: "ARG", name: "Argentina" },
    { code: "COL", name: "Colombia" },
    { code: "CHL", name: "Chile" },
    { code: "PER", name: "Perú" },
    { code: "OTHER", name: "Other / Outro" },
];

const formSchema = z.object({
    name: z.string().min(1),
    email: z.string().email(),
    phone: z.string().optional(),
    territory: z.string().min(1),
    documentType: z.string().min(1),
    documentNumber: z.string().min(1),
    addressCity: z.string().optional(),
    addressCountry: z.string().min(1),
    notes: z.string().optional(),
});

type FormData = z.infer<typeof formSchema>;

interface RegistrationFormProps {
    t: any;
    onSuccess: (data: any) => void;
}

export function RegistrationForm({ t, onSuccess }: RegistrationFormProps) {
    const { toast } = useToast();
    const [step, setStep] = useState(1);

    const form = useForm<FormData>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            name: "",
            email: "",
            phone: "",
            territory: "",
            documentType: "",
            documentNumber: "",
            addressCity: "",
            addressCountry: "BRA",
            notes: "",
        },
    });

    const submitMutation = useMutation({
        mutationFn: async (data: FormData) => {
            const response = await fetch("/api/master-leads/register", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(data),
            });
            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.message || "Registration failed");
            }
            return response.json();
        },
        onSuccess: (data) => {
            onSuccess(data);
            toast({
                title: t.success,
                description: data.message,
            });
        },
        onError: (error: any) => {
            toast({
                title: "Error",
                description: error.message || "Registration failed",
                variant: "destructive",
            });
        },
    });

    const onSubmit = (data: FormData) => {
        submitMutation.mutate(data);
    };

    const nextStep = async () => {
        const fields = step === 1
            ? ["name", "email", "phone"] as const
            : ["territory", "documentType", "documentNumber", "addressCountry"] as const;

        const isValid = await form.trigger(fields);
        if (isValid) {
            setStep(step + 1);
        }
    };

    return (
        <Card className="bg-black/40 border-blue-500/30 backdrop-blur-sm">
            <CardHeader>
                <div className="flex items-center gap-4 mb-2">
                    <div className={`flex items-center justify-center w-8 h-8 rounded-full ${step >= 1 ? 'bg-blue-500' : 'bg-blue-900'}`}>
                        <User className="h-4 w-4 text-white" />
                    </div>
                    <div className="h-0.5 flex-1 bg-blue-800">
                        <div className={`h-full ${step >= 2 ? 'bg-blue-500' : 'bg-blue-800'}`} style={{ width: step >= 2 ? '100%' : '0%' }} />
                    </div>
                    <div className={`flex items-center justify-center w-8 h-8 rounded-full ${step >= 2 ? 'bg-blue-500' : 'bg-blue-900'}`}>
                        <MapPin className="h-4 w-4 text-white" />
                    </div>
                </div>
                <CardTitle className="text-lg text-blue-100">
                    {step === 1 ? t.step1Title : t.step2Title}
                </CardTitle>
            </CardHeader>
            <CardContent>
                <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                        {step === 1 && (
                            <>
                                <FormField
                                    control={form.control}
                                    name="name"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel className="text-blue-200">{t.name}</FormLabel>
                                            <FormControl>
                                                <Input
                                                    {...field}
                                                    placeholder={t.namePlaceholder}
                                                    className="bg-black/30 border-blue-500/30 text-blue-100 placeholder:text-blue-300/50"
                                                    data-testid="input-name"
                                                />
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
                                            <FormLabel className="text-blue-200">{t.email}</FormLabel>
                                            <FormControl>
                                                <Input
                                                    {...field}
                                                    type="email"
                                                    placeholder={t.emailPlaceholder}
                                                    className="bg-black/30 border-blue-500/30 text-blue-100 placeholder:text-blue-300/50"
                                                    data-testid="input-email"
                                                />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />

                                <FormField
                                    control={form.control}
                                    name="phone"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel className="text-blue-200">{t.phone}</FormLabel>
                                            <FormControl>
                                                <Input
                                                    {...field}
                                                    placeholder={t.phonePlaceholder}
                                                    className="bg-black/30 border-blue-500/30 text-blue-100 placeholder:text-blue-300/50"
                                                    data-testid="input-phone"
                                                />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                            </>
                        )}

                        {step === 2 && (
                            <>
                                <FormField
                                    control={form.control}
                                    name="territory"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel className="text-blue-200">{t.territory}</FormLabel>
                                            <FormControl>
                                                <Input
                                                    {...field}
                                                    placeholder={t.territoryPlaceholder}
                                                    className="bg-black/30 border-blue-500/30 text-blue-100 placeholder:text-blue-300/50"
                                                    data-testid="input-territory"
                                                />
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
                                                <FormLabel className="text-blue-200">{t.documentType}</FormLabel>
                                                <Select onValueChange={field.onChange} value={field.value}>
                                                    <FormControl>
                                                        <SelectTrigger className="bg-black/30 border-blue-500/30 text-blue-100" data-testid="select-document-type">
                                                            <SelectValue />
                                                        </SelectTrigger>
                                                    </FormControl>
                                                    <SelectContent>
                                                        <SelectItem value="cpf">{t.cpf}</SelectItem>
                                                        <SelectItem value="cnpj">{t.cnpj}</SelectItem>
                                                        <SelectItem value="passport">{t.passport}</SelectItem>
                                                        <SelectItem value="tax_id">{t.taxId}</SelectItem>
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
                                                <FormLabel className="text-blue-200">{t.documentNumber}</FormLabel>
                                                <FormControl>
                                                    <Input
                                                        {...field}
                                                        placeholder={t.documentPlaceholder}
                                                        className="bg-black/30 border-blue-500/30 text-blue-100 placeholder:text-blue-300/50"
                                                        data-testid="input-document-number"
                                                    />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <FormField
                                        control={form.control}
                                        name="addressCity"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel className="text-blue-200">{t.city}</FormLabel>
                                                <FormControl>
                                                    <Input
                                                        {...field}
                                                        placeholder={t.cityPlaceholder}
                                                        className="bg-black/30 border-blue-500/30 text-blue-100 placeholder:text-blue-300/50"
                                                        data-testid="input-city"
                                                    />
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
                                                <FormLabel className="text-blue-200">{t.country}</FormLabel>
                                                <Select onValueChange={field.onChange} value={field.value}>
                                                    <FormControl>
                                                        <SelectTrigger className="bg-black/30 border-blue-500/30 text-blue-100" data-testid="select-country">
                                                            <SelectValue />
                                                        </SelectTrigger>
                                                    </FormControl>
                                                    <SelectContent>
                                                        {countries.map((country) => (
                                                            <SelectItem key={country.code} value={country.code}>
                                                                {country.name}
                                                            </SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
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
                                            <FormLabel className="text-blue-200">{t.notes}</FormLabel>
                                            <FormControl>
                                                <Textarea
                                                    {...field}
                                                    placeholder={t.notesPlaceholder}
                                                    className="bg-black/30 border-blue-500/30 text-blue-100 placeholder:text-blue-300/50 min-h-[100px]"
                                                    data-testid="textarea-notes"
                                                />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                            </>
                        )}

                        <div className="flex gap-2">
                            {step > 1 && (
                                <Button
                                    type="button"
                                    variant="outline"
                                    className="flex-1 border-blue-500/30 text-blue-200 hover:bg-blue-900/30"
                                    onClick={() => setStep(step - 1)}
                                    data-testid="button-previous"
                                >
                                    {t.previous}
                                </Button>
                            )}

                            {step < 2 ? (
                                <Button
                                    type="button"
                                    className="flex-1 bg-blue-600 hover:bg-blue-500 text-white"
                                    onClick={nextStep}
                                    data-testid="button-next"
                                >
                                    {t.next}
                                </Button>
                            ) : (
                                <Button
                                    type="submit"
                                    className="flex-1 bg-blue-600 hover:bg-blue-500 text-white"
                                    disabled={submitMutation.isPending}
                                    data-testid="button-submit"
                                >
                                    {submitMutation.isPending ? (
                                        <>
                                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                            {t.submitting}
                                        </>
                                    ) : (
                                        t.submit
                                    )}
                                </Button>
                            )}
                        </div>
                    </form>
                </Form>
            </CardContent>
        </Card>
    );
}
