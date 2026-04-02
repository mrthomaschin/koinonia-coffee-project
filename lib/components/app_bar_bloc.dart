enum Pages { home, menu, about, blog, gallery, events, contact }

class AppBarBloc {
  AppBarBloc(this.selectedPage, {this.onNavigate});

  Pages selectedPage;
  final Function(Pages)? onNavigate;
  Pages? hoveredPage;

  void onPageSelected(Pages page) {
    selectedPage = page;
    onNavigate?.call(page);
  }

  void onPageHovered(Pages? page) {
    hoveredPage = page;
  }

  bool isPageHovered(Pages page) {
    return hoveredPage == page;
  }
}
