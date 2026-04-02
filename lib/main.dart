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
  late final ContactBloc _contactBloc;
  late final BottomBarBloc _bottomBarBloc;

  @override
  void initState() {
    super.initState();
    _appBarBloc = AppBarBloc(_currentPage, onNavigate: _handleNavigation);
    _contactBloc = ContactBloc();
    _bottomBarBloc = BottomBarBloc();
  }

  void _handleNavigation(Pages page) {
    setState(() {
      _currentPage = page;
      _appBarBloc.selectedPage = page;
    });
  }

  Widget _getPageContent(BoxConstraints constraints) {
    switch (_currentPage) {
      case Pages.home:
        return HomepageWidget(availableHeight: constraints.maxHeight);
      case Pages.contact:
        return ContactWidget(
          bloc: _contactBloc,
          availableHeight: constraints.maxHeight,
        );
      case Pages.menu:
      case Pages.about:
      case Pages.blog:
      case Pages.gallery:
      case Pages.events:
        return ComingSoonWidget(availableHeight: constraints.maxHeight);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: ConstantsLibrary.clPearlPrimaryColor,
      body: Column(
        children: [
          AppBarWidget(bloc: _appBarBloc),
          Expanded(
            child: LayoutBuilder(
              builder: (context, constraints) {
                return SingleChildScrollView(
                  child: ConstrainedBox(
                    constraints: BoxConstraints(
                      minHeight: constraints.maxHeight,
                    ),
                    child: Column(
                      children: [
                        _getPageContent(constraints),
                        BottomBarWidget(bloc: _bottomBarBloc),
                      ],
                    ),
                  ),
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}
