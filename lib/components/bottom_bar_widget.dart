import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';
import '../constants_library.dart';
import 'bottom_bar_bloc.dart';

class BottomBarWidget extends StatelessWidget {
  const BottomBarWidget({super.key, required this.bloc});

  final BottomBarBloc bloc;

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 40, vertical: 20),
          decoration: BoxDecoration(
            color: ConstantsLibrary.clPearlPrimaryColor,
          ),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              SvgPicture.asset(
                ConstantsLibrary.clLogoMark,
                height: 50,
                colorFilter: const ColorFilter.mode(
                  ConstantsLibrary.clMarinaPrimaryColor,
                  BlendMode.srcIn,
                ),
              ),
              const Spacer(),
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'FOLLOW ALONG',
                    style: TextStyle(
                      fontFamily: ConstantsLibrary.clSlugFont,
                      fontSize: 14,
                      fontWeight: FontWeight.w700,
                      color: ConstantsLibrary.clMidnightPrimaryColor,
                      letterSpacing: 1,
                    ),
                  ),
                  const SizedBox(height: 12),
                  InkWell(
                    onTap: () => bloc.openInstagram(),
                    child: Row(
                      children: [
                        Image.asset(
                          ConstantsLibrary.clInstagramIcon,
                          width: 20,
                          height: 20,
                          color: ConstantsLibrary.clMidnightPrimaryColor,
                        ),
                        const SizedBox(width: 8),
                        Text(
                          'Instagram',
                          style: TextStyle(
                            fontFamily: ConstantsLibrary.clBodyFont,
                            fontSize: 14,
                            color: ConstantsLibrary.clMidnightPrimaryColor,
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
              const SizedBox(width: 60),
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'CONTACT US',
                    style: TextStyle(
                      fontFamily: ConstantsLibrary.clSlugFont,
                      fontSize: 14,
                      fontWeight: FontWeight.w700,
                      color: ConstantsLibrary.clMidnightPrimaryColor,
                      letterSpacing: 1,
                    ),
                  ),
                  const SizedBox(height: 12),
                  InkWell(
                    onTap: () => bloc.openEmail(),
                    child: Row(
                      children: [
                        Icon(
                          Icons.email_outlined,
                          size: 20,
                          color: ConstantsLibrary.clMidnightPrimaryColor,
                        ),
                        const SizedBox(width: 8),
                        Text(
                          'hello@koinoniacoffeeproject.com',
                          style: TextStyle(
                            fontFamily: ConstantsLibrary.clBodyFont,
                            fontSize: 14,
                            color: ConstantsLibrary.clMidnightPrimaryColor,
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
        Container(
          padding: const EdgeInsets.symmetric(vertical: 16),
          decoration: BoxDecoration(
            color: ConstantsLibrary.clMidnightPrimaryColor,
          ),
          child: Center(
            child: Text(
              '© 2026 KOINONIA COFFEE PROJECT | ALL RIGHTS RESERVED',
              style: TextStyle(
                fontFamily: ConstantsLibrary.clSlugFont,
                fontSize: 12,
                color: ConstantsLibrary.clPearlPrimaryColor,
              ),
            ),
          ),
        ),
      ],
    );
  }
}
