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
  CreateNoteDto,
  UpdateNoteDto,
  UpdateNotePositionDto,
} from './dto/note.dto';
import { NotesService } from './notes.service';

@UseGuards(JwtAuthGuard)
@Controller('boards/:boardId/notes')
export class NotesController {
  constructor(private readonly notes: NotesService) {}

  @Get()
  list(
    @Param('boardId', ParseUUIDPipe) boardId: string,
    @Req() request: { user: { id: string } },
  ) {
    return this.notes.listActive(boardId, request.user.id);
  }

  @Post()
  create(
    @Param('boardId', ParseUUIDPipe) boardId: string,
    @Body() dto: CreateNoteDto,
    @Req() request: { user: { id: string } },
  ) {
    return this.notes.create(boardId, dto, request.user.id);
  }

  @Patch(':id')
  update(
    @Param('boardId', ParseUUIDPipe) boardId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateNoteDto,
    @Req() request: { user: { id: string } },
  ) {
    return this.notes.update(boardId, id, dto, request.user.id);
  }

  @Delete(':id')
  remove(
    @Param('boardId', ParseUUIDPipe) boardId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: { user: { id: string } },
  ) {
    return this.notes.softDelete(boardId, id, request.user.id);
  }

  @Post(':id/restore')
  restore(
    @Param('boardId', ParseUUIDPipe) boardId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: { user: { id: string } },
  ) {
    return this.notes.restore(boardId, id, request.user.id);
  }

  @Get(':id/history')
  history(
    @Param('boardId', ParseUUIDPipe) boardId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() pagination: PaginationQueryDto,
    @Req() request: { user: { id: string } },
  ) {
    return this.notes.history(boardId, id, request.user.id, pagination);
  }

  @Patch(':id/position')
  position(
    @Param('boardId', ParseUUIDPipe) boardId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateNotePositionDto,
    @Req() request: { user: { id: string } },
  ) {
    return this.notes.updatePosition(boardId, id, dto, request.user.id);
  }
}
