"""
Regras de acesso por sede.

- Administrador (is_staff): vê e altera tudo, em todas as sedes.
- Funcionário: só vê e altera dados da própria sede.
- Qualquer outro usuário logado: sem acesso.
"""

from rest_framework import permissions

from .models import Funcionario


def sede_do_usuario(usuario):
    """
    Retorna o id da sede do funcionário logado.
    None significa "todas as sedes" (administrador).
    """
    if usuario.is_staff:
        return None
    if not hasattr(usuario, "_sede_id_cache"):
        usuario._sede_id_cache = (
            Funcionario.objects.filter(usuario=usuario).values_list("sede_id", flat=True).first()
        )
    return usuario._sede_id_cache


class EhAdminOuFuncionario(permissions.BasePermission):
    message = "Acesso permitido somente a funcionários e administradores."

    def has_permission(self, request, view):
        usuario = request.user
        if not (usuario and usuario.is_authenticated):
            return False
        return usuario.is_staff or sede_do_usuario(usuario) is not None


class SomenteAdminAltera(permissions.BasePermission):
    """Leitura para todos com acesso; criar/editar/excluir só administrador."""

    message = "Somente administradores podem alterar este cadastro."

    def has_permission(self, request, view):
        return request.method in permissions.SAFE_METHODS or request.user.is_staff
