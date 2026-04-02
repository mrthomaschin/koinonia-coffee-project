enum Pages { home, menu, about, blog, gallery, events, contact }

class AppBarBloc {
  AppBarBloc(this.selectedPage, {this.onNavigate});

  Pages selectedPage;
  final Function(Pages)? onNavigate;

  void onPageSelected(Pages page) {
    selectedPage = page;
    onNavigate?.call(page);
  }
}
