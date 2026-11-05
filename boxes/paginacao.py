from rest_framework.pagination import PageNumberPagination


class Paginacao(PageNumberPagination):
    """50 por página; o site pode pedir até 500 com ?page_size=."""

    page_size = 50
    page_size_query_param = "page_size"
    max_page_size = 500
