from django import forms
from django.contrib import admin
from django.contrib.auth import get_user_model

from .models import Box, Cliente, Funcionario, Interessado, Mensalidade, Sede, TipoBox

User = get_user_model()


@admin.register(Sede)
class SedeAdmin(admin.ModelAdmin):
    list_display = ["nome", "endereco"]
    search_fields = ["nome", "endereco"]


@admin.register(Cliente)
class ClienteAdmin(admin.ModelAdmin):
    list_display = ["nome"]
    search_fields = ["nome"]


@admin.register(Box)
class BoxAdmin(admin.ModelAdmin):
    list_display = ["id", "sede", "tamanho", "valor", "cliente", "dia_vencimento", "alugado"]
    list_filter = ["sede"]
    search_fields = ["cliente__nome"]

    @admin.display(boolean=True)
    def alugado(self, obj):
        return obj.alugado


class FuncionarioAdminForm(forms.ModelForm):
    """Permite editar o e-mail (guardado na conta de login) pela tela do funcionário."""

    email = forms.EmailField(label="e-mail", help_text="Usado para recuperar a senha.")

    class Meta:
        model = Funcionario
        fields = ["nome", "sede"]

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        if self.instance.pk:
            self.fields["email"].initial = self.instance.usuario.email

    def clean_email(self):
        email = self.cleaned_data["email"].strip().lower()
        outros = User.objects.filter(email__iexact=email)
        if self.instance.pk:
            outros = outros.exclude(pk=self.instance.usuario_id)
        if outros.exists():
            raise forms.ValidationError("Já existe funcionário com este e-mail.")
        return email

    def save(self, commit=True):
        funcionario = super().save(commit=commit)
        funcionario.usuario.email = self.cleaned_data["email"]
        funcionario.usuario.save(update_fields=["email"])
        return funcionario


@admin.register(Funcionario)
class FuncionarioAdmin(admin.ModelAdmin):
    form = FuncionarioAdminForm
    fields = ["nome", "cpf", "email", "sede", "usuario"]
    list_display = ["nome", "cpf", "email", "sede", "aprovado"]
    list_filter = ["sede", "usuario__is_active"]
    search_fields = ["nome", "cpf", "usuario__email"]
    readonly_fields = ["usuario", "cpf"]

    def has_add_permission(self, request):
        return False  # funcionários se cadastram pelo site (/api/auth/registro/)

    @admin.display(description="e-mail")
    def email(self, obj):
        return obj.usuario.email
    actions = ["aprovar", "bloquear"]

    @admin.display(boolean=True)
    def aprovado(self, obj):
        return obj.aprovado

    @admin.action(description="Aprovar acesso dos funcionários selecionados")
    def aprovar(self, request, queryset):
        User.objects.filter(funcionario__in=queryset).update(is_active=True)

    @admin.action(description="Bloquear acesso dos funcionários selecionados")
    def bloquear(self, request, queryset):
        User.objects.filter(funcionario__in=queryset).update(is_active=False)


@admin.register(Mensalidade)
class MensalidadeAdmin(admin.ModelAdmin):
    list_display = ["box", "cliente", "competencia", "vencimento", "valor", "pago_em"]
    list_filter = ["box__sede", "competencia"]
    search_fields = ["cliente__nome", "box__id"]
    date_hierarchy = "vencimento"
    raw_id_fields = ["box", "cliente", "registrado_por"]


@admin.register(Interessado)
class InteressadoAdmin(admin.ModelAdmin):
    list_display = ["nome", "telefone", "sede", "tamanho", "situacao", "criado_em"]
    list_filter = ["situacao", "sede"]
    search_fields = ["nome", "telefone"]


@admin.register(TipoBox)
class TipoBoxAdmin(admin.ModelAdmin):
    list_display = ["codigo", "sede", "area", "volume", "valor", "sugestao_uso", "ordem"]
    list_filter = ["sede"]
    list_editable = ["valor", "ordem"]
