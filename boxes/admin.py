from django.contrib import admin
from django.contrib.auth import get_user_model

from .models import Box, Cliente, Funcionario, Sede

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
    list_display = ["id", "sede", "tamanho", "valor", "cliente", "alugado"]
    list_filter = ["sede"]
    search_fields = ["cliente__nome"]

    @admin.display(boolean=True)
    def alugado(self, obj):
        return obj.alugado


@admin.register(Funcionario)
class FuncionarioAdmin(admin.ModelAdmin):
    list_display = ["nome", "cpf", "sede", "aprovado"]
    list_filter = ["sede", "usuario__is_active"]
    search_fields = ["nome", "cpf"]
    readonly_fields = ["usuario", "cpf"]
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
