import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';
import '../constants_library.dart';
import 'bottom_bar_bloc.dart';

class BottomBarWidget extends StatelessWidget {
  const BottomBarWidget({super.key, required this.bloc});

  final BottomBarBloc bloc;

  Widget _buildFollowAlongSection() {
    return Column(
      mainAxisSize: MainAxisSize.min,
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
            mainAxisSize: MainAxisSize.min,
            children: [
              Image.asset(
                ConstantsLibrary.clInstagramIcon,
                width: 20,
                height: 20,
                color: ConstantsLibrary.clMidnightPrimaryColor,
              ),
              const SizedBox(width: 8),
              Flexible(
                child: Text(
                  'Instagram',
                  style: TextStyle(
                    fontFamily: ConstantsLibrary.clBodyFont,
                    fontSize: 14,
                    color: ConstantsLibrary.clMidnightPrimaryColor,
                  ),
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildContactSection() {
    return Column(
      mainAxisSize: MainAxisSize.min,
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
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(
                Icons.email_outlined,
                size: 20,
                color: ConstantsLibrary.clMidnightPrimaryColor,
              ),
              const SizedBox(width: 8),
              Flexible(
                child: Text(
                  'hello@koinoniacoffeeproject.com',
                  style: TextStyle(
                    fontFamily: ConstantsLibrary.clBodyFont,
                    fontSize: 14,
                    color: ConstantsLibrary.clMidnightPrimaryColor,
                  ),
                  overflow: TextOverflow.ellipsis,
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildLogo() {
    return SvgPicture.asset(
      ConstantsLibrary.clLogoMark,
      height: 50,
      colorFilter: const ColorFilter.mode(
        ConstantsLibrary.clMarinaPrimaryColor,
        BlendMode.srcIn,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        LayoutBuilder(
          builder: (context, constraints) {
            final isMobile = ConstantsLibrary.isMobile(constraints);

            return Container(
              padding: const EdgeInsets.symmetric(horizontal: 40, vertical: 20),
              decoration: const BoxDecoration(
                color: ConstantsLibrary.clPearlPrimaryColor,
              ),
              child: isMobile
                  ? Row(
                      crossAxisAlignment: CrossAxisAlignment.center,
                      children: [
                        _buildLogo(),
                        const SizedBox(width: 24),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              _buildFollowAlongSection(),
                              const SizedBox(height: 24),
                              _buildContactSection(),
                            ],
                          ),
                        ),
                      ],
                    )
                  : Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        _buildLogo(),
                        const Spacer(),
                        _buildFollowAlongSection(),
                        const SizedBox(width: 60),
                        _buildContactSection(),
                      ],
                    ),
            );
          },
        ),
        Container(
          padding: const EdgeInsets.symmetric(vertical: 16, horizontal: 24),
          decoration: const BoxDecoration(
            color: ConstantsLibrary.clMidnightPrimaryColor,
          ),
          child: Center(
            child: Text(
              '© 2026 KOINONIA COFFEE PROJECT | ALL RIGHTS RESERVED',
              textAlign: TextAlign.center,
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
