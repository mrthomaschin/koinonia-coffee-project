import 'package:flutter/material.dart';
import 'package:koinonia_coffee_project/components/bottom_bar_bloc.dart';
import 'package:koinonia_coffee_project/components/bottom_bar_widget.dart';
import 'package:koinonia_coffee_project/pages/contact/contact_bloc.dart';
import 'package:koinonia_coffee_project/pages/contact/contact_widget.dart';
import 'package:koinonia_coffee_project/pages/homepage/homepage_widget.dart';
import 'package:koinonia_coffee_project/utils/coming_soon_widget.dart';
import 'components/app_bar_widget.dart';
import 'components/app_bar_bloc.dart';
import 'constants_library.dart';

void main() {
  runApp(const MyApp());
}

class MyApp extends StatelessWidget {
  const MyApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Koinonia Coffee Project',
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xFF2F2B39)),
        useMaterial3: true,
      ),
      home: const MainScreen(),
    );
  }
}

class MainScreen extends StatefulWidget {
  const MainScreen({super.key});

  @override
  State<MainScreen> createState() => _MainScreenState();
}

class _MainScreenState extends State<MainScreen> {
  Pages _currentPage = Pages.home;
  late final AppBarBloc _appBarBloc;
  ContactBloc? _contactBloc;
  late final BottomBarBloc _bottomBarBloc;

  @override
  void initState() {
    super.initState();
    _appBarBloc = AppBarBloc(_currentPage, onNavigate: _handleNavigation);
    _bottomBarBloc = BottomBarBloc();
  }

  @override
  void dispose() {
    _appBarBloc.dispose();
    _contactBloc?.dispose();
    super.dispose();
  }

  ContactBloc _getOrCreateContactBloc() {
    _contactBloc ??= ContactBloc();
    return _contactBloc!;
  }

  void _handleNavigation(Pages page) {
    if (_currentPage != page) {
      setState(() {
        _currentPage = page;
      });
      _appBarBloc.selectedPage = page;
    }
  }

  Widget _getPageContent(BuildContext context) {
    final mq = MediaQuery.of(context);
    final availableHeight =
        mq.size.height -
        ConstantsLibrary.clBottomBarHeight -
        ConstantsLibrary.clAppBarHeight;

    switch (_currentPage) {
      case Pages.home:
        return HomepageWidget(availableHeight: availableHeight);
      case Pages.contact:
        return ContactWidget(
          bloc: _getOrCreateContactBloc(),
          availableHeight: availableHeight,
        );
      case Pages.menu:
      case Pages.about:
      case Pages.blog:
      case Pages.gallery:
      case Pages.events:
        return ComingSoonWidget(availableHeight: availableHeight);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: ConstantsLibrary.clPearlPrimaryColor,
      body: Column(
        children: [
          RepaintBoundary(child: AppBarWidget(bloc: _appBarBloc)),
          Expanded(
            child: SingleChildScrollView(
              child: Column(
                children: [
                  _getPageContent(context),
                  RepaintBoundary(child: BottomBarWidget(bloc: _bottomBarBloc)),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}
