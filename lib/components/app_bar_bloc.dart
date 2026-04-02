import 'package:flutter/foundation.dart';

enum Pages { home, menu, about, blog, gallery, events, contact }

class AppBarBloc {
  AppBarBloc(Pages initialPage, {this.onNavigate})
    : _selectedPage = ValueNotifier<Pages>(initialPage);

  final ValueNotifier<Pages> _selectedPage;
  final Function(Pages)? onNavigate;

  Pages get selectedPage => _selectedPage.value;
  set selectedPage(Pages page) => _selectedPage.value = page;

  ValueListenable<Pages> get selectedPageListenable => _selectedPage;

  void onPageSelected(Pages page) {
    _selectedPage.value = page;
    onNavigate?.call(page);
  }

  void dispose() {
    _selectedPage.dispose();
  }
}
