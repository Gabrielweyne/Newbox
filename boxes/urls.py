from django.urls import path
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import TokenRefreshView

from .auth import EuView, LoginView, LogoutView, RegistroView

from .views import BoxViewSet, ClienteViewSet, FuncionarioViewSet, SedeViewSet

router = DefaultRouter()
router.register("sedes", SedeViewSet, basename="sede")
router.register("clientes", ClienteViewSet, basename="cliente")
router.register("boxes", BoxViewSet, basename="box")
router.register("funcionarios", FuncionarioViewSet, basename="funcionario")

urlpatterns = [
    path("auth/registro/", RegistroView.as_view(), name="registro"),
    path("auth/login/", LoginView.as_view(), name="login"),
    path("auth/token/refresh/", TokenRefreshView.as_view(), name="token_refresh"),
    path("auth/logout/", LogoutView.as_view(), name="logout"),
    path("auth/eu/", EuView.as_view(), name="eu"),
] + router.urls
