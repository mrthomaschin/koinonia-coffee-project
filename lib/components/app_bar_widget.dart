import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';
import '../constants_library.dart';
import 'app_bar_bloc.dart';

class AppBarWidget extends StatefulWidget {
  const AppBarWidget({super.key, required this.bloc});

  final AppBarBloc bloc;

  @override
  State<AppBarWidget> createState() => _AppBarWidgetState();
}

class _AppBarWidgetState extends State<AppBarWidget> {
  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final isMobile = constraints.maxWidth < 1024;

        return Container(
          height: 80,
          padding: EdgeInsets.symmetric(horizontal: isMobile ? 16 : 40),
          decoration: BoxDecoration(
            color: ConstantsLibrary.clPearlPrimaryColor,
          ),
          child: Row(
            children: [
              InkWell(
                onTap: () => widget.bloc.onPageSelected(Pages.home),
                child: SvgPicture.asset(
                  ConstantsLibrary.clPrimary,
                  height: isMobile ? 40 : 50,
                  colorFilter: const ColorFilter.mode(
                    ConstantsLibrary.clMarinaPrimaryColor,
                    BlendMode.srcIn,
                  ),
                ),
              ),
              const Spacer(),
              if (isMobile) _buildDropdownMenu() else ..._buildDesktopNav(),
            ],
          ),
        );
      },
    );
  }

  List<Widget> _buildDesktopNav() {
    return [
      _buildNavItem('MENU', Pages.menu),
      const SizedBox(width: 40),
      _buildNavItem('ABOUT', Pages.about),
      const SizedBox(width: 40),
      _buildNavItem('BLOG', Pages.blog),
      const SizedBox(width: 40),
      _buildNavItem('GALLERY', Pages.gallery),
      const SizedBox(width: 40),
      _buildNavItem('EVENTS', Pages.events),
      const SizedBox(width: 40),
      _buildNavItem('CONTACT', Pages.contact),
      const Spacer(),
      ElevatedButton(
        onPressed: () {},
        style: ElevatedButton.styleFrom(
          backgroundColor: ConstantsLibrary.clEucalyptusSecondaryColor,
          foregroundColor: Colors.white,
          padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 16),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
        ),
        child: const Text(
          'FIND US THIS WEEK',
          style: TextStyle(
            fontFamily: ConstantsLibrary.clSlugFont,
            fontSize: 12,
            fontWeight: FontWeight.w500,
            letterSpacing: 1,
          ),
        ),
      ),
    ];
  }

  Widget _buildDropdownMenu() {
    return PopupMenuButton<Pages>(
      icon: Icon(
        Icons.menu,
        color: ConstantsLibrary.clMidnightPrimaryColor,
        size: 28,
      ),
      offset: const Offset(0, 50),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
      color: ConstantsLibrary.clPearlPrimaryColor,
      itemBuilder: (BuildContext context) => [
        _buildMenuItem('MENU', Pages.menu),
        _buildMenuItem('ABOUT', Pages.about),
        _buildMenuItem('BLOG', Pages.blog),
        _buildMenuItem('GALLERY', Pages.gallery),
        _buildMenuItem('EVENTS', Pages.events),
        _buildMenuItem('CONTACT', Pages.contact),
        PopupMenuItem<Pages>(
          enabled: false,
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: 8),
            child: ElevatedButton(
              onPressed: () {
                Navigator.pop(context);
              },
              style: ElevatedButton.styleFrom(
                backgroundColor: ConstantsLibrary.clEucalyptusSecondaryColor,
                foregroundColor: Colors.white,
                padding: const EdgeInsets.symmetric(
                  horizontal: 20,
                  vertical: 12,
                ),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(8),
                ),
              ),
              child: const Text(
                'FIND US THIS WEEK',
                style: TextStyle(
                  fontFamily: ConstantsLibrary.clSlugFont,
                  fontSize: 11,
                  fontWeight: FontWeight.w500,
                  letterSpacing: 1,
                ),
              ),
            ),
          ),
        ),
      ],
      onSelected: (Pages page) {
        widget.bloc.onPageSelected(page);
      },
    );
  }

  PopupMenuItem<Pages> _buildMenuItem(String label, Pages page) {
    final isSelected = widget.bloc.selectedPage == page;
    return PopupMenuItem<Pages>(
      value: page,
      child: Text(
        label,
        style: TextStyle(
          fontFamily: ConstantsLibrary.clSlugFont,
          fontSize: 13,
          fontWeight: FontWeight.w700,
          color: ConstantsLibrary.clMidnightPrimaryColor,
          letterSpacing: 1,
          decoration: isSelected
              ? TextDecoration.underline
              : TextDecoration.none,
          decorationColor: ConstantsLibrary.clMidnightPrimaryColor,
          decorationThickness: 2.5,
        ),
      ),
    );
  }

  Widget _buildNavItem(String label, Pages page) {
    final isSelected = widget.bloc.selectedPage == page;
    return InkWell(
      onTap: () => widget.bloc.onPageSelected(page),
      child: Text(
        label,
        style: TextStyle(
          fontFamily: ConstantsLibrary.clSlugFont,
          fontSize: 13,
          fontWeight: FontWeight.w700,
          color: ConstantsLibrary.clMidnightPrimaryColor,
          letterSpacing: 1,
          decoration: isSelected
              ? TextDecoration.underline
              : TextDecoration.none,
          decorationColor: ConstantsLibrary.clMidnightPrimaryColor,
          decorationThickness: 2.5,
          decorationStyle: TextDecorationStyle.solid,
        ),
      ),
    );
  }
}
