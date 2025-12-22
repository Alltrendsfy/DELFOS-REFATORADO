import { useQuery, useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useLanguage } from "@/contexts/LanguageContext";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { usePersona } from "@/hooks/usePersona";
import { 
  FileText, 
  Plus, 
  Edit2, 
  Eye,
  ShieldAlert,
  Check,
  X
} from "lucide-react";

interface ContractTemplate {
  id: string;
  name: string;
  code: string;
  type: string;
  content: string;
  version: string;
  requires_acceptance: boolean;
  is_mandatory: boolean;
  applies_to: string;
  is_active: boolean;
  published_at: string | null;
  created_at: string;
}

const templateSchema = z.object({
  name: z.string().min(3, "Name is required"),
  code: z.string().min(2, "Code is required"),
  type: z.string().min(1, "Type is required"),
  content: z.string().min(10, "Content is required"),
  version: z.string().default("1.0"),
  requires_acceptance: z.boolean().default(true),
  is_mandatory: z.boolean().default(true),
  applies_to: z.string().default("all"),
  is_active: z.boolean().default(true),
});

type TemplateFormData = z.infer<typeof templateSchema>;

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

function TemplateCard({ 
  template, 
  onEdit, 
  onView 
}: { 
  template: ContractTemplate; 
  onEdit: () => void;
  onView: () => void;
}) {
  const { t } = useLanguage();
  
  const typeLabels: Record<string, string> = {
    franchise: t('contracts.typeFranchise'),
    master_franchise: t('contracts.typeMaster'),
    terms: t('contracts.typeTerms'),
    privacy: t('contracts.typePrivacy'),
    other: t('contracts.typeOther'),
  };
  
  const appliesToLabels: Record<string, string> = {
    franchise: t('contracts.appliesToFranchise'),
    master_franchise: t('contracts.appliesToMaster'),
    all: t('contracts.appliesToAll'),
  };

  return (
    <Card className="hover-elevate" data-testid={`card-template-${template.id}`}>
      <CardHeader className="flex flex-row items-start justify-between gap-2">
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <CardTitle className="text-lg">{template.name}</CardTitle>
            <Badge variant={template.is_active ? "default" : "secondary"}>
              {template.is_active ? t('contracts.active') : t('contracts.inactive')}
            </Badge>
          </div>
          <CardDescription className="mt-1">
            {t('contracts.code')}: {template.code} | v{template.version}
          </CardDescription>
        </div>
        <div className="flex gap-1">
          <Button size="icon" variant="ghost" onClick={onView} data-testid={`button-view-${template.id}`}>
            <Eye className="w-4 h-4" />
          </Button>
          <Button size="icon" variant="ghost" onClick={onEdit} data-testid={`button-edit-${template.id}`}>
            <Edit2 className="w-4 h-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-2 text-sm text-muted-foreground">
          <span>{t('contracts.type')}: {typeLabels[template.type] || template.type}</span>
          <span>|</span>
          <span>{t('contracts.appliesTo')}: {appliesToLabels[template.applies_to] || template.applies_to}</span>
        </div>
        <div className="flex flex-wrap gap-2 mt-3">
          {template.requires_acceptance && (
            <Badge variant="outline" className="text-xs">
              <Check className="w-3 h-3 mr-1" />
              {t('contracts.requiresAcceptance')}
            </Badge>
          )}
          {template.is_mandatory && (
            <Badge variant="outline" className="text-xs">
              {t('contracts.mandatory')}
            </Badge>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function TemplateFormDialog({
  open,
  onOpenChange,
  template,
  mode,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  template?: ContractTemplate;
  mode: 'create' | 'edit' | 'view';
}) {
  const { t } = useLanguage();
  const { toast } = useToast();
  
  const form = useForm<TemplateFormData>({
    resolver: zodResolver(templateSchema),
    defaultValues: template ? {
      name: template.name,
      code: template.code,
      type: template.type,
      content: template.content,
      version: template.version,
      requires_acceptance: template.requires_acceptance,
      is_mandatory: template.is_mandatory,
      applies_to: template.applies_to,
      is_active: template.is_active,
    } : {
      name: "",
      code: "",
      type: "franchise",
      content: "",
      version: "1.0",
      requires_acceptance: true,
      is_mandatory: true,
      applies_to: "all",
      is_active: true,
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (data: TemplateFormData) => {
      if (template?.id) {
        return apiRequest(`/api/contracts/templates/${template.id}`, "PUT", data);
      }
      return apiRequest("/api/contracts/templates", "POST", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contracts/templates"] });
      toast({
        title: t('contracts.saveSuccess'),
        description: t('contracts.saveSuccessDesc'),
      });
      onOpenChange(false);
    },
    onError: () => {
      toast({
        title: t('contracts.saveError'),
        description: t('contracts.saveErrorDesc'),
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: TemplateFormData) => {
    saveMutation.mutate(data);
  };

  const isReadOnly = mode === 'view';
  const dialogTitle = mode === 'create' 
    ? t('contracts.createTemplate') 
    : mode === 'edit' 
      ? t('contracts.editTemplate')
      : t('contracts.viewTemplate');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5" />
            {dialogTitle}
          </DialogTitle>
        </DialogHeader>
        
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('contracts.templateName')}</FormLabel>
                    <FormControl>
                      <Input {...field} disabled={isReadOnly} data-testid="input-template-name" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="code"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('contracts.code')}</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="franchise_agreement" disabled={isReadOnly} data-testid="input-template-code" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <FormField
                control={form.control}
                name="type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('contracts.type')}</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value} disabled={isReadOnly}>
                      <FormControl>
                        <SelectTrigger data-testid="select-template-type">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="franchise">{t('contracts.typeFranchise')}</SelectItem>
                        <SelectItem value="master_franchise">{t('contracts.typeMaster')}</SelectItem>
                        <SelectItem value="terms">{t('contracts.typeTerms')}</SelectItem>
                        <SelectItem value="privacy">{t('contracts.typePrivacy')}</SelectItem>
                        <SelectItem value="other">{t('contracts.typeOther')}</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="applies_to"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('contracts.appliesTo')}</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value} disabled={isReadOnly}>
                      <FormControl>
                        <SelectTrigger data-testid="select-applies-to">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="franchise">{t('contracts.appliesToFranchise')}</SelectItem>
                        <SelectItem value="master_franchise">{t('contracts.appliesToMaster')}</SelectItem>
                        <SelectItem value="all">{t('contracts.appliesToAll')}</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="version"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('contracts.version')}</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="1.0" disabled={isReadOnly} data-testid="input-version" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="content"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('contracts.content')}</FormLabel>
                  <FormControl>
                    <Textarea 
                      {...field} 
                      rows={10}
                      disabled={isReadOnly}
                      placeholder={t('contracts.contentPlaceholder')}
                      data-testid="textarea-content"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <FormField
                control={form.control}
                name="requires_acceptance"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                    <FormLabel>{t('contracts.requiresAcceptance')}</FormLabel>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        disabled={isReadOnly}
                        data-testid="switch-requires-acceptance"
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="is_mandatory"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                    <FormLabel>{t('contracts.mandatory')}</FormLabel>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        disabled={isReadOnly}
                        data-testid="switch-mandatory"
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="is_active"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                    <FormLabel>{t('contracts.active')}</FormLabel>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        disabled={isReadOnly}
                        data-testid="switch-active"
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
            </div>

            {!isReadOnly && (
              <div className="flex justify-end gap-2 pt-4">
                <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                  {t('common.cancel')}
                </Button>
                <Button type="submit" disabled={saveMutation.isPending} data-testid="button-save-template">
                  {saveMutation.isPending ? t('common.saving') : t('common.save')}
                </Button>
              </div>
            )}
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

export default function ContractTemplates() {
  const { t } = useLanguage();
  const { persona, isLoading: personaLoading } = usePersona();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<ContractTemplate | undefined>();
  const [dialogMode, setDialogMode] = useState<'create' | 'edit' | 'view'>('create');

  const { data: templatesData, isLoading } = useQuery<{ templates: ContractTemplate[] }>({
    queryKey: ["/api/contracts/templates"],
    enabled: persona === 'franchisor',
  });
  
  const templates = templatesData?.templates;

  const handleCreate = () => {
    setSelectedTemplate(undefined);
    setDialogMode('create');
    setDialogOpen(true);
  };

  const handleEdit = (template: ContractTemplate) => {
    setSelectedTemplate(template);
    setDialogMode('edit');
    setDialogOpen(true);
  };

  const handleView = (template: ContractTemplate) => {
    setSelectedTemplate(template);
    setDialogMode('view');
    setDialogOpen(true);
  };

  if (personaLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-48" />)}
        </div>
      </div>
    );
  }

  if (persona !== 'franchisor') {
    return <AccessDenied />;
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">
            {t('contracts.title')}
          </h1>
          <p className="text-muted-foreground">
            {t('contracts.subtitle')}
          </p>
        </div>
        <Button onClick={handleCreate} data-testid="button-create-template">
          <Plus className="w-4 h-4 mr-2" />
          {t('contracts.createTemplate')}
        </Button>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-48" />)}
        </div>
      ) : templates && templates.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {templates.map(template => (
            <TemplateCard
              key={template.id}
              template={template}
              onEdit={() => handleEdit(template)}
              onView={() => handleView(template)}
            />
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <FileText className="w-12 h-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">{t('contracts.noTemplates')}</h3>
            <p className="text-muted-foreground text-center mb-4">
              {t('contracts.noTemplatesDesc')}
            </p>
            <Button onClick={handleCreate}>
              <Plus className="w-4 h-4 mr-2" />
              {t('contracts.createFirst')}
            </Button>
          </CardContent>
        </Card>
      )}

      <TemplateFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        template={selectedTemplate}
        mode={dialogMode}
      />
    </div>
  );
}
