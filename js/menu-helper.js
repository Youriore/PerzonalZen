function closeOffcanvas() {
    const offcanvasElement = document.getElementById('offcanvasSidebar');
    const offcanvasInstance = bootstrap.Offcanvas.getInstance(offcanvasElement);
    if (offcanvasInstance) {
        offcanvasInstance.hide();
    }
}
