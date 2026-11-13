from django.urls import path
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import TokenRefreshView

from .auth import EuView, LoginView, LogoutView, RegistroView
from .publico import PublicoView
from .senha import EsqueciSenhaView, RedefinirSenhaView

from .views import (
    BoxViewSet,
    ClienteViewSet,
    ComunicadoViewSet,
    ContratoViewSet,
    DisponibilidadeView,
    FuncionarioViewSet,
    InteressadoViewSet,
    MensalidadeViewSet,
    SedeViewSet,
    TipoBoxViewSet,
)

router = DefaultRouter()
router.register("sedes", SedeViewSet, basename="sede")
router.register("clientes", ClienteViewSet, basename="cliente")
router.register("boxes", BoxViewSet, basename="box")
router.register("mensalidades", MensalidadeViewSet, basename="mensalidade")
router.register("interessados", InteressadoViewSet, basename="interessado")
router.register("contratos", ContratoViewSet, basename="contrato")
router.register("tipos", TipoBoxViewSet, basename="tipo")
router.register("comunicados", ComunicadoViewSet, basename="comunicado")
router.register("funcionarios", FuncionarioViewSet, basename="funcionario")

urlpatterns = [
    path("publico/", PublicoView.as_view(), name="publico"),
    path("disponibilidade/", DisponibilidadeView.as_view(), name="disponibilidade"),
    path("auth/registro/", RegistroView.as_view(), name="registro"),
    path("auth/login/", LoginView.as_view(), name="login"),
    path("auth/token/refresh/", TokenRefreshView.as_view(), name="token_refresh"),
    path("auth/logout/", LogoutView.as_view(), name="logout"),
    path("auth/eu/", EuView.as_view(), name="eu"),
    path("auth/senha/esqueci/", EsqueciSenhaView.as_view(), name="senha_esqueci"),
    path("auth/senha/redefinir/", RedefinirSenhaView.as_view(), name="senha_redefinir"),
] + router.urls
