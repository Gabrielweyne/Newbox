from rest_framework.routers import DefaultRouter

from .views import BoxViewSet, ClienteViewSet, SedeViewSet

router = DefaultRouter()
router.register("sedes", SedeViewSet, basename="sede")
router.register("clientes", ClienteViewSet, basename="cliente")
router.register("boxes", BoxViewSet, basename="box")

urlpatterns = router.urls
