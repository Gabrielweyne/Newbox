from rest_framework.routers import DefaultRouter

from .views import BoxViewSet, ClienteViewSet, FuncionarioViewSet, SedeViewSet

router = DefaultRouter()
router.register("sedes", SedeViewSet, basename="sede")
router.register("clientes", ClienteViewSet, basename="cliente")
router.register("boxes", BoxViewSet, basename="box")
router.register("funcionarios", FuncionarioViewSet, basename="funcionario")

urlpatterns = router.urls
