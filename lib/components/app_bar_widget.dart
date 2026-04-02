import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';
import '../constants_library.dart';
import 'app_bar_bloc.dart';

class AppBarWidget extends StatelessWidget {
  const AppBarWidget({super.key, required this.bloc});

  final AppBarBloc bloc;

  @override
  Widget build(BuildContext context) {
    return Container(
      height: 80,
      padding: const EdgeInsets.symmetric(horizontal: 40),
      decoration: BoxDecoration(color: ConstantsLibrary.clPearlPrimaryColor),
      child: Row(
        children: [
          InkWell(
            onTap: () => bloc.onPageSelected(Pages.home),
            child: SvgPicture.asset(
              ConstantsLibrary.clPrimary,
              height: 50,
              colorFilter: const ColorFilter.mode(
                ConstantsLibrary.clMarinaPrimaryColor,
                BlendMode.srcIn,
              ),
            ),
          ),
          const Spacer(),
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
            // TODO: implement some button
            onPressed: () {},
            style: ElevatedButton.styleFrom(
              backgroundColor: ConstantsLibrary.clEucalyptusSecondaryColor,
              foregroundColor: Colors.white,
              padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 16),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(8),
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
        ],
      ),
    );
  }

  Widget _buildNavItem(String label, Pages page) {
    final isSelected = bloc.selectedPage == page;
    return InkWell(
      onTap: () => bloc.onPageSelected(page),
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
