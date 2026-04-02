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

  void _handleNavigation(Pages page) {
    setState(() {
      _currentPage = page;
    });
  }

  Widget _getPageContent() {
    switch (_currentPage) {
      case Pages.home:
        return const HomepageWidget();
      case Pages.contact:
        return ContactWidget(bloc: ContactBloc());
      case Pages.menu:
      case Pages.about:
      case Pages.blog:
      case Pages.gallery:
      case Pages.events:
        return const ComingSoonWidget();
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: ConstantsLibrary.clPearlPrimaryColor,
      body: Column(
        children: [
          AppBarWidget(
            bloc: AppBarBloc(_currentPage, onNavigate: _handleNavigation),
          ),
          Expanded(
            child: SingleChildScrollView(
              child: ConstrainedBox(
                constraints: BoxConstraints(
                  minHeight:
                      MediaQuery.of(context).size.height -
                      ConstantsLibrary.clAppBarHeight,
                ),
                child: Column(
                  children: [
                    _getPageContent(),
                    BottomBarWidget(bloc: BottomBarBloc()),
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
