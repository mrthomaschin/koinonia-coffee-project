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
    final screenWidth = MediaQuery.sizeOf(context).width;
    final isMobile = screenWidth < 1024;

    return Container(
      height: 80,
      padding: EdgeInsets.symmetric(horizontal: isMobile ? 16 : 40),
      decoration: const BoxDecoration(
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
          shape: const RoundedRectangleBorder(
            borderRadius: BorderRadius.all(Radius.circular(8)),
          ),
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
    return RepaintBoundary(
      child: PopupMenuButton<Pages>(
        icon: const Icon(
          Icons.menu,
          color: ConstantsLibrary.clMidnightPrimaryColor,
          size: 28,
        ),
        offset: const Offset(0, 50),
        elevation: 2,
        shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.all(Radius.circular(8)),
        ),
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
                  shape: const RoundedRectangleBorder(
                    borderRadius: BorderRadius.all(Radius.circular(8)),
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
      ),
    );
  }

  PopupMenuItem<Pages> _buildMenuItem(String label, Pages page) {
    return PopupMenuItem<Pages>(
      value: page,
      child: ValueListenableBuilder<Pages>(
        valueListenable: widget.bloc.selectedPageListenable,
        builder: (context, selectedPage, child) {
          final isSelected = selectedPage == page;
          return Column(
            crossAxisAlignment: CrossAxisAlignment.center,
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                label,
                style: const TextStyle(
                  fontFamily: ConstantsLibrary.clSlugFont,
                  fontSize: 13,
                  fontWeight: FontWeight.w700,
                  color: ConstantsLibrary.clMidnightPrimaryColor,
                  letterSpacing: 1,
                ),
              ),
              if (isSelected) ...[
                const SizedBox(height: 4),
                Container(
                  height: 2,
                  width: 40,
                  decoration: const BoxDecoration(
                    color: ConstantsLibrary.clMidnightPrimaryColor,
                  ),
                ),
              ],
            ],
          );
        },
      ),
    );
  }

  Widget _buildNavItem(String label, Pages page) {
    return RepaintBoundary(
      child: _AnimatedNavItem(label: label, page: page, bloc: widget.bloc),
    );
  }
}

class _AnimatedNavItem extends StatefulWidget {
  const _AnimatedNavItem({
    required this.label,
    required this.page,
    required this.bloc,
  });

  final String label;
  final Pages page;
  final AppBarBloc bloc;

  @override
  State<_AnimatedNavItem> createState() => _AnimatedNavItemState();
}

class _AnimatedNavItemState extends State<_AnimatedNavItem> {
  bool _isHovered = false;

  @override
  Widget build(BuildContext context) {
    return ValueListenableBuilder<Pages>(
      valueListenable: widget.bloc.selectedPageListenable,
      builder: (context, selectedPage, child) {
        final isSelected = selectedPage == widget.page;
        final showUnderline = isSelected || _isHovered;

        return MouseRegion(
          onEnter: (_) {
            if (!_isHovered) {
              setState(() {
                _isHovered = true;
              });
            }
          },
          onExit: (_) {
            if (_isHovered) {
              setState(() {
                _isHovered = false;
              });
            }
          },
          cursor: SystemMouseCursors.click,
          child: InkWell(
            onTap: () => widget.bloc.onPageSelected(widget.page),
            hoverColor: Colors.transparent,
            splashColor: Colors.transparent,
            highlightColor: Colors.transparent,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  widget.label,
                  style: const TextStyle(
                    fontFamily: ConstantsLibrary.clSlugFont,
                    fontSize: 13,
                    fontWeight: FontWeight.w700,
                    color: ConstantsLibrary.clMidnightPrimaryColor,
                    letterSpacing: 1,
                  ),
                ),
                const SizedBox(height: 3),
                AnimatedContainer(
                  duration: const Duration(milliseconds: 200),
                  curve: Curves.easeInOut,
                  height: 2,
                  width: showUnderline ? 40 : 0,
                  decoration: const BoxDecoration(
                    color: ConstantsLibrary.clMidnightPrimaryColor,
                  ),
                ),
              ],
            ),
          ),
        );
      },
    );
  }
}
