import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useLanguage } from "@/contexts/LanguageContext";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { usePersona } from "@/hooks/usePersona";
import { 
  Building2, 
  MapPin, 
  CreditCard, 
  Mail, 
  Palette,
  Save,
  ShieldAlert
} from "lucide-react";

const settingsSchema = z.object({
  legal_name: z.string().min(3, "Legal name is required"),
  trade_name: z.string().min(2, "Trade name is required"),
  tax_id: z.string().min(5, "Tax ID is required"),
  tax_id_type: z.string().default("cnpj"),
  state_registration: z.string().optional(),
  municipal_registration: z.string().optional(),
  address_street: z.string().optional(),
  address_number: z.string().optional(),
  address_complement: z.string().optional(),
  address_neighborhood: z.string().optional(),
  address_city: z.string().optional(),
  address_state: z.string().optional(),
  address_zip: z.string().optional(),
  address_country: z.string().default("BRA"),
  bank_name: z.string().optional(),
  bank_code: z.string().optional(),
  bank_agency: z.string().optional(),
  bank_account: z.string().optional(),
  bank_account_type: z.string().optional(),
  bank_pix_key: z.string().optional(),
  bank_swift: z.string().optional(),
  bank_iban: z.string().optional(),
  tax_regime: z.string().optional(),
  nfse_enabled: z.boolean().default(false),
  invoice_series: z.string().optional(),
  contact_email: z.string().email().optional().or(z.literal("")),
  contact_phone: z.string().optional(),
  contact_whatsapp: z.string().optional(),
  support_email: z.string().email().optional().or(z.literal("")),
  commercial_email: z.string().email().optional().or(z.literal("")),
  website: z.string().optional(),
  social_linkedin: z.string().optional(),
  social_instagram: z.string().optional(),
  social_twitter: z.string().optional(),
  logo_url: z.string().optional(),
  primary_color: z.string().optional(),
  secondary_color: z.string().optional(),
});

type SettingsFormData = z.infer<typeof settingsSchema>;

interface FranchisorSettingsData {
  id?: string;
  legal_name: string;
  trade_name: string;
  tax_id: string;
  tax_id_type: string;
  state_registration?: string;
  municipal_registration?: string;
  address_street?: string;
  address_number?: string;
  address_complement?: string;
  address_neighborhood?: string;
  address_city?: string;
  address_state?: string;
  address_zip?: string;
  address_country: string;
  bank_name?: string;
  bank_code?: string;
  bank_agency?: string;
  bank_account?: string;
  bank_account_type?: string;
  bank_pix_key?: string;
  bank_swift?: string;
  bank_iban?: string;
  tax_regime?: string;
  nfse_enabled: boolean;
  invoice_series?: string;
  contact_email?: string;
  contact_phone?: string;
  contact_whatsapp?: string;
  support_email?: string;
  commercial_email?: string;
  website?: string;
  social_linkedin?: string;
  social_instagram?: string;
  social_twitter?: string;
  logo_url?: string;
  primary_color?: string;
  secondary_color?: string;
  is_configured: boolean;
}

function AccessDenied() {
  const { t } = useLanguage();
  return (
    <div className="flex items-center justify-center h-full p-8">
      <Card className="max-w-md">
        <CardHeader className="text-center">
          <ShieldAlert className="w-12 h-12 mx-auto text-destructive mb-4" />
          <CardTitle>{t('accessDenied.title')}</CardTitle>
          <CardDescription>{t('accessDenied.message')}</CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}

export default function FranchisorSettings() {
  const { t } = useLanguage();
  const { toast } = useToast();
  const { persona, isLoading: personaLoading } = usePersona();

  const { data: settings, isLoading } = useQuery<FranchisorSettingsData>({
    queryKey: ["/api/franchisor/settings"],
    enabled: persona === 'franchisor',
  });

  const form = useForm<SettingsFormData>({
    resolver: zodResolver(settingsSchema),
    defaultValues: {
      legal_name: "",
      trade_name: "",
      tax_id: "",
      tax_id_type: "cnpj",
      address_country: "BRA",
      nfse_enabled: false,
    },
    values: settings ? {
      legal_name: settings.legal_name || "",
      trade_name: settings.trade_name || "",
      tax_id: settings.tax_id || "",
      tax_id_type: settings.tax_id_type || "cnpj",
      state_registration: settings.state_registration || "",
      municipal_registration: settings.municipal_registration || "",
      address_street: settings.address_street || "",
      address_number: settings.address_number || "",
      address_complement: settings.address_complement || "",
      address_neighborhood: settings.address_neighborhood || "",
      address_city: settings.address_city || "",
      address_state: settings.address_state || "",
      address_zip: settings.address_zip || "",
      address_country: settings.address_country || "BRA",
      bank_name: settings.bank_name || "",
      bank_code: settings.bank_code || "",
      bank_agency: settings.bank_agency || "",
      bank_account: settings.bank_account || "",
      bank_account_type: settings.bank_account_type || "",
      bank_pix_key: settings.bank_pix_key || "",
      bank_swift: settings.bank_swift || "",
      bank_iban: settings.bank_iban || "",
      tax_regime: settings.tax_regime || "",
      nfse_enabled: settings.nfse_enabled || false,
      invoice_series: settings.invoice_series || "",
      contact_email: settings.contact_email || "",
      contact_phone: settings.contact_phone || "",
      contact_whatsapp: settings.contact_whatsapp || "",
      support_email: settings.support_email || "",
      commercial_email: settings.commercial_email || "",
      website: settings.website || "",
      social_linkedin: settings.social_linkedin || "",
      social_instagram: settings.social_instagram || "",
      social_twitter: settings.social_twitter || "",
      logo_url: settings.logo_url || "",
      primary_color: settings.primary_color || "",
      secondary_color: settings.secondary_color || "",
    } : undefined,
  });

  const saveMutation = useMutation({
    mutationFn: async (data: SettingsFormData) => {
      return apiRequest(
        "/api/franchisor/settings",
        settings?.id ? "PUT" : "POST",
        data
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/franchisor/settings"] });
      toast({
        title: t('franchisorSettings.saveSuccess'),
        description: t('franchisorSettings.saveSuccessDesc'),
      });
    },
    onError: () => {
      toast({
        title: t('franchisorSettings.saveError'),
        description: t('franchisorSettings.saveErrorDesc'),
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: SettingsFormData) => {
    saveMutation.mutate(data);
  };

  if (personaLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-[600px] w-full" />
      </div>
    );
  }

  if (persona !== 'franchisor') {
    return <AccessDenied />;
  }

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-[600px] w-full" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">
            {t('franchisorSettings.title')}
          </h1>
          <p className="text-muted-foreground">
            {t('franchisorSettings.subtitle')}
          </p>
        </div>
        <Button 
          onClick={form.handleSubmit(onSubmit)}
          disabled={saveMutation.isPending}
          data-testid="button-save-settings"
        >
          <Save className="w-4 h-4 mr-2" />
          {saveMutation.isPending ? t('common.saving') : t('common.save')}
        </Button>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <Tabs defaultValue="legal" className="w-full">
            <TabsList className="grid w-full grid-cols-5">
              <TabsTrigger value="legal" data-testid="tab-legal">
                <Building2 className="w-4 h-4 mr-2" />
                {t('franchisorSettings.tabLegal')}
              </TabsTrigger>
              <TabsTrigger value="address" data-testid="tab-address">
                <MapPin className="w-4 h-4 mr-2" />
                {t('franchisorSettings.tabAddress')}
              </TabsTrigger>
              <TabsTrigger value="banking" data-testid="tab-banking">
                <CreditCard className="w-4 h-4 mr-2" />
                {t('franchisorSettings.tabBanking')}
              </TabsTrigger>
              <TabsTrigger value="contact" data-testid="tab-contact">
                <Mail className="w-4 h-4 mr-2" />
                {t('franchisorSettings.tabContact')}
              </TabsTrigger>
              <TabsTrigger value="branding" data-testid="tab-branding">
                <Palette className="w-4 h-4 mr-2" />
                {t('franchisorSettings.tabBranding')}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="legal" className="mt-6">
              <Card>
                <CardHeader>
                  <CardTitle>{t('franchisorSettings.legalInfo')}</CardTitle>
                  <CardDescription>{t('franchisorSettings.legalInfoDesc')}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="legal_name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t('franchisorSettings.legalName')}</FormLabel>
                          <FormControl>
                            <Input {...field} data-testid="input-legal-name" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="trade_name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t('franchisorSettings.tradeName')}</FormLabel>
                          <FormControl>
                            <Input {...field} data-testid="input-trade-name" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <FormField
                      control={form.control}
                      name="tax_id_type"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t('franchisorSettings.taxIdType')}</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                              <SelectTrigger data-testid="select-tax-id-type">
                                <SelectValue />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="cnpj">CNPJ (Brazil)</SelectItem>
                              <SelectItem value="ein">EIN (USA)</SelectItem>
                              <SelectItem value="vat">VAT (EU)</SelectItem>
                              <SelectItem value="rfc">RFC (Mexico)</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="tax_id"
                      render={({ field }) => (
                        <FormItem className="col-span-2">
                          <FormLabel>{t('franchisorSettings.taxId')}</FormLabel>
                          <FormControl>
                            <Input {...field} data-testid="input-tax-id" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="state_registration"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t('franchisorSettings.stateRegistration')}</FormLabel>
                          <FormControl>
                            <Input {...field} data-testid="input-state-registration" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="municipal_registration"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t('franchisorSettings.municipalRegistration')}</FormLabel>
                          <FormControl>
                            <Input {...field} data-testid="input-municipal-registration" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="tax_regime"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t('franchisorSettings.taxRegime')}</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                              <SelectTrigger data-testid="select-tax-regime">
                                <SelectValue placeholder={t('franchisorSettings.selectTaxRegime')} />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="simples_nacional">Simples Nacional</SelectItem>
                              <SelectItem value="lucro_presumido">Lucro Presumido</SelectItem>
                              <SelectItem value="lucro_real">Lucro Real</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="nfse_enabled"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                          <div className="space-y-0.5">
                            <FormLabel>{t('franchisorSettings.nfseEnabled')}</FormLabel>
                          </div>
                          <FormControl>
                            <Switch
                              checked={field.value}
                              onCheckedChange={field.onChange}
                              data-testid="switch-nfse-enabled"
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="address" className="mt-6">
              <Card>
                <CardHeader>
                  <CardTitle>{t('franchisorSettings.addressInfo')}</CardTitle>
                  <CardDescription>{t('franchisorSettings.addressInfoDesc')}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <FormField
                      control={form.control}
                      name="address_street"
                      render={({ field }) => (
                        <FormItem className="col-span-3">
                          <FormLabel>{t('franchisorSettings.street')}</FormLabel>
                          <FormControl>
                            <Input {...field} data-testid="input-street" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="address_number"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t('franchisorSettings.number')}</FormLabel>
                          <FormControl>
                            <Input {...field} data-testid="input-number" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="address_complement"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t('franchisorSettings.complement')}</FormLabel>
                          <FormControl>
                            <Input {...field} data-testid="input-complement" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="address_neighborhood"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t('franchisorSettings.neighborhood')}</FormLabel>
                          <FormControl>
                            <Input {...field} data-testid="input-neighborhood" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <FormField
                      control={form.control}
                      name="address_city"
                      render={({ field }) => (
                        <FormItem className="col-span-2">
                          <FormLabel>{t('franchisorSettings.city')}</FormLabel>
                          <FormControl>
                            <Input {...field} data-testid="input-city" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="address_state"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t('franchisorSettings.state')}</FormLabel>
                          <FormControl>
                            <Input {...field} data-testid="input-state" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="address_zip"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t('franchisorSettings.zip')}</FormLabel>
                          <FormControl>
                            <Input {...field} data-testid="input-zip" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  <FormField
                    control={form.control}
                    name="address_country"
                    render={({ field }) => (
                      <FormItem className="max-w-xs">
                        <FormLabel>{t('franchisorSettings.country')}</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
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
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="banking" className="mt-6">
              <Card>
                <CardHeader>
                  <CardTitle>{t('franchisorSettings.bankingInfo')}</CardTitle>
                  <CardDescription>{t('franchisorSettings.bankingInfoDesc')}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <FormField
                      control={form.control}
                      name="bank_name"
                      render={({ field }) => (
                        <FormItem className="col-span-2">
                          <FormLabel>{t('franchisorSettings.bankName')}</FormLabel>
                          <FormControl>
                            <Input {...field} data-testid="input-bank-name" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="bank_code"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t('franchisorSettings.bankCode')}</FormLabel>
                          <FormControl>
                            <Input {...field} data-testid="input-bank-code" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <FormField
                      control={form.control}
                      name="bank_agency"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t('franchisorSettings.bankAgency')}</FormLabel>
                          <FormControl>
                            <Input {...field} data-testid="input-bank-agency" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="bank_account"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t('franchisorSettings.bankAccount')}</FormLabel>
                          <FormControl>
                            <Input {...field} data-testid="input-bank-account" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="bank_account_type"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t('franchisorSettings.accountType')}</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                              <SelectTrigger data-testid="select-account-type">
                                <SelectValue placeholder={t('franchisorSettings.selectAccountType')} />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="checking">{t('franchisorSettings.checking')}</SelectItem>
                              <SelectItem value="savings">{t('franchisorSettings.savings')}</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  <FormField
                    control={form.control}
                    name="bank_pix_key"
                    render={({ field }) => (
                      <FormItem className="max-w-md">
                        <FormLabel>{t('franchisorSettings.pixKey')}</FormLabel>
                        <FormControl>
                          <Input {...field} data-testid="input-pix-key" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="bank_swift"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t('franchisorSettings.swift')}</FormLabel>
                          <FormControl>
                            <Input {...field} placeholder="BOFAUS3N" data-testid="input-swift" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="bank_iban"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t('franchisorSettings.iban')}</FormLabel>
                          <FormControl>
                            <Input {...field} placeholder="BR00 0000 0000 0000 0000 0000" data-testid="input-iban" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="contact" className="mt-6">
              <Card>
                <CardHeader>
                  <CardTitle>{t('franchisorSettings.contactInfo')}</CardTitle>
                  <CardDescription>{t('franchisorSettings.contactInfoDesc')}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <FormField
                      control={form.control}
                      name="contact_email"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t('franchisorSettings.contactEmail')}</FormLabel>
                          <FormControl>
                            <Input type="email" {...field} data-testid="input-contact-email" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="contact_phone"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t('franchisorSettings.contactPhone')}</FormLabel>
                          <FormControl>
                            <Input {...field} data-testid="input-contact-phone" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="contact_whatsapp"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t('franchisorSettings.contactWhatsapp')}</FormLabel>
                          <FormControl>
                            <Input {...field} data-testid="input-contact-whatsapp" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="support_email"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t('franchisorSettings.supportEmail')}</FormLabel>
                          <FormControl>
                            <Input type="email" {...field} data-testid="input-support-email" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="commercial_email"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t('franchisorSettings.commercialEmail')}</FormLabel>
                          <FormControl>
                            <Input type="email" {...field} data-testid="input-commercial-email" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  <FormField
                    control={form.control}
                    name="website"
                    render={({ field }) => (
                      <FormItem className="max-w-md">
                        <FormLabel>{t('franchisorSettings.website')}</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="https://www.example.com" data-testid="input-website" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <FormField
                      control={form.control}
                      name="social_linkedin"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>LinkedIn</FormLabel>
                          <FormControl>
                            <Input {...field} placeholder="https://linkedin.com/company/..." data-testid="input-linkedin" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="social_instagram"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Instagram</FormLabel>
                          <FormControl>
                            <Input {...field} placeholder="@username" data-testid="input-instagram" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="social_twitter"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Twitter/X</FormLabel>
                          <FormControl>
                            <Input {...field} placeholder="@username" data-testid="input-twitter" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="branding" className="mt-6">
              <Card>
                <CardHeader>
                  <CardTitle>{t('franchisorSettings.brandingInfo')}</CardTitle>
                  <CardDescription>{t('franchisorSettings.brandingInfoDesc')}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <FormField
                    control={form.control}
                    name="logo_url"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('franchisorSettings.logoUrl')}</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="https://example.com/logo.png" data-testid="input-logo-url" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="primary_color"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t('franchisorSettings.primaryColor')}</FormLabel>
                          <FormControl>
                            <div className="flex items-center gap-2">
                              <Input {...field} placeholder="#5B9FB5" data-testid="input-primary-color" />
                              {field.value && (
                                <div 
                                  className="w-10 h-10 rounded border"
                                  style={{ backgroundColor: field.value }}
                                />
                              )}
                            </div>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="secondary_color"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t('franchisorSettings.secondaryColor')}</FormLabel>
                          <FormControl>
                            <div className="flex items-center gap-2">
                              <Input {...field} placeholder="#7DD3E8" data-testid="input-secondary-color" />
                              {field.value && (
                                <div 
                                  className="w-10 h-10 rounded border"
                                  style={{ backgroundColor: field.value }}
                                />
                              )}
                            </div>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </form>
      </Form>
    </div>
  );
}
