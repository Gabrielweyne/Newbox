from django.contrib import admin

from .models import Box, Cliente, Sede


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
