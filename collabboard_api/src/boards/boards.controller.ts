import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PaginationQueryDto } from '../common/dto/pagination.dto';
import {
  CreateBoardDto,
  InviteMemberDto,
  UpdateBoardDto,
  UpdateMemberRoleDto,
} from './dto/board.dto';
import { BoardsService } from './boards.service';

@UseGuards(JwtAuthGuard)
@Controller('boards')
export class BoardsController {
  constructor(private readonly boards: BoardsService) {}

  @Get()
  list(
    @Query() pagination: PaginationQueryDto,
    @Req() request: { user: { id: string } },
  ) {
    return this.boards.listForUser(request.user.id, pagination);
  }

  @Post()
  create(
    @Body() dto: CreateBoardDto,
    @Req() request: { user: { id: string } },
  ) {
    return this.boards.create(dto, request.user.id);
  }

  @Get(':id')
  get(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: { user: { id: string } },
  ) {
    return this.boards.getWithMembers(id, request.user.id);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateBoardDto,
    @Req() request: { user: { id: string } },
  ) {
    return this.boards.update(id, dto, request.user.id);
  }

  @Delete(':id')
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: { user: { id: string } },
  ) {
    return this.boards.remove(id, request.user.id);
  }

  @Post(':id/members')
  invite(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: InviteMemberDto,
    @Req() request: { user: { id: string } },
  ) {
    return this.boards.inviteMember(id, dto, request.user.id);
  }

  @Patch(':id/members/:userId')
  changeRole(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() dto: UpdateMemberRoleDto,
    @Req() request: { user: { id: string } },
  ) {
    return this.boards.changeMemberRole(id, userId, dto.role, request.user.id);
  }

  @Delete(':id/members/:userId')
  removeMember(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Req() request: { user: { id: string } },
  ) {
    return this.boards.removeMember(id, userId, request.user.id);
  }
}
