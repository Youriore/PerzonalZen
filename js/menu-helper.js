function closeOffcanvas() {
    const offcanvasElement = document.getElementById('offcanvasSidebar');
    if (offcanvasElement && offcanvasElement.classList.contains('show')) {
        offcanvasElement.classList.remove('show');
        document.body.classList.remove('sidebar-open');
    }
}
